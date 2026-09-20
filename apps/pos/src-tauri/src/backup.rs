use crate::database;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::sqlite::SqlitePool;
use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

pub const BACKUP_FORMAT_VERSION: u32 = 1;
const CURRENT_SCHEMA_VERSION: i64 = 5;
const AUTOMATIC_RETENTION: usize = 14;
const MANIFEST: &str = "manifest.json";
const DATABASE: &str = "database.sqlite";
const EXPECTED_TABLES: [&str; 16] = [
    "businesses",
    "users",
    "menu_categories",
    "menu_items",
    "restaurant_tables",
    "orders",
    "order_items",
    "kitchen_tickets",
    "kitchen_ticket_items",
    "payments",
    "receipts",
    "inventory_items",
    "stock_movements",
    "printers",
    "app_metadata",
    "print_attempts",
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub file_name: String,
    pub kind: String,
    pub created_at: i64,
    pub schema_version: i64,
    pub size_bytes: u64,
    pub valid: bool,
    pub format_version: u32,
    pub app_version: String,
    pub backup_id: String,
    pub checksum: String,
    pub verification_status: String,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseHealth {
    pub healthy: bool,
    pub schema_version: i64,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case", tag = "code", content = "message")]
pub enum BackupError {
    MissingFile(String),
    MalformedManifest(String),
    UnsupportedFormat(String),
    ChecksumMismatch(String),
    IncompatibleSchema(String),
    InvalidDatabase(String),
    Disk(String),
    Restore(String),
}
impl fmt::Display for BackupError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::MissingFile(m) => write!(f, "missing_file: {m}"),
            Self::MalformedManifest(m) => write!(f, "malformed_manifest: {m}"),
            Self::UnsupportedFormat(m) => write!(f, "unsupported_backup_format: {m}"),
            Self::ChecksumMismatch(m) => write!(f, "checksum_mismatch: {m}"),
            Self::IncompatibleSchema(m) => write!(f, "incompatible_schema: {m}"),
            Self::InvalidDatabase(m) => write!(f, "invalid_database: {m}"),
            Self::Disk(m) => write!(f, "disk_error: {m}"),
            Self::Restore(m) => write!(f, "restore_failed: {m}"),
        }
    }
}
impl std::error::Error for BackupError {}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    format_version: u32,
    app_version: String,
    schema_version: i64,
    business_id: Option<String>,
    created_at: i64,
    backup_id: String,
    database_file: String,
    database_sha256: String,
    encryption: String,
}

/// Provider boundary. Providers enumerate/delete artifact paths; the engine owns
/// SQLite snapshotting, manifests, verification and restore safety.
pub trait BackupStorage {
    fn root(&self) -> &Path;
    fn delete(&self, file_name: &str) -> Result<(), BackupError>;
}
pub struct LocalBackupStorage {
    root: PathBuf,
}
impl LocalBackupStorage {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }
}
impl BackupStorage for LocalBackupStorage {
    fn root(&self) -> &Path {
        &self.root
    }
    fn delete(&self, file_name: &str) -> Result<(), BackupError> {
        fs::remove_dir_all(safe_artifact_path(&self.root, file_name)?)
            .map_err(|e| BackupError::Disk(format!("could not delete backup ({e})")))
    }
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or_default()
}
fn day() -> i64 {
    now() / 86_400
}
fn kind_name(kind: &str) -> &'static str {
    match kind {
        "automatic" => "automatic",
        "pre_restore" => "pre_restore",
        _ => "manual",
    }
}
fn artifact_name(kind: &str) -> String {
    format!(
        "ate05-backup-{}-{}.ate05backup",
        kind_name(kind),
        if kind == "automatic" {
            day().to_string()
        } else {
            Uuid::new_v4().to_string()
        }
    )
}
fn safe_artifact_path(root: &Path, name: &str) -> Result<PathBuf, BackupError> {
    let path = Path::new(name);
    if path.file_name().and_then(|v| v.to_str()) != Some(name) || !name.ends_with(".ate05backup") {
        return Err(BackupError::MissingFile("invalid ATE05 backup name".into()));
    }
    Ok(root.join(name))
}
pub async fn verify_named(root: &Path, name: &str) -> Result<BackupInfo, BackupError> {
    verify(&safe_artifact_path(root, name)?).await
}
fn sha256(path: &Path) -> Result<String, BackupError> {
    let bytes =
        fs::read(path).map_err(|e| BackupError::Disk(format!("could not read snapshot ({e})")))?;
    Ok(format!("{:x}", Sha256::digest(bytes)))
}
fn write_manifest(path: &Path, manifest: &Manifest) -> Result<(), BackupError> {
    fs::write(
        path,
        serde_json::to_vec_pretty(manifest)
            .map_err(|e| BackupError::MalformedManifest(e.to_string()))?,
    )
    .map_err(|e| BackupError::Disk(format!("could not write manifest ({e})")))
}
fn read_manifest(path: &Path) -> Result<Manifest, BackupError> {
    serde_json::from_slice(
        &fs::read(path.join(MANIFEST))
            .map_err(|e| BackupError::MissingFile(format!("manifest is missing ({e})")))?,
    )
    .map_err(|e| BackupError::MalformedManifest(e.to_string()))
}
async fn schema_version(pool: &SqlitePool) -> Result<i64, BackupError> {
    sqlx::query_scalar::<_, i64>(
        "SELECT COALESCE(MAX(version), 0) FROM _sqlx_migrations WHERE success = 1",
    )
    .fetch_one(pool)
    .await
    .map_err(|e| BackupError::InvalidDatabase(format!("migration metadata is missing ({e})")))
}
async fn check_database(path: &Path) -> Result<i64, BackupError> {
    let pool = database::connect(path)
        .await
        .map_err(|e| BackupError::InvalidDatabase(format!("database could not be opened ({e})")))?;
    let result = async {
        let integrity: String = sqlx::query_scalar("PRAGMA integrity_check")
            .fetch_one(&pool)
            .await
            .map_err(|e| BackupError::InvalidDatabase(e.to_string()))?;
        if integrity != "ok" {
            return Err(BackupError::InvalidDatabase(format!(
                "integrity check returned {integrity}"
            )));
        }
        if !sqlx::query("PRAGMA foreign_key_check")
            .fetch_all(&pool)
            .await
            .map_err(|e| BackupError::InvalidDatabase(e.to_string()))?
            .is_empty()
        {
            return Err(BackupError::InvalidDatabase(
                "foreign-key check found inconsistent records".into(),
            ));
        }
        let version = schema_version(&pool).await?;
        for table in EXPECTED_TABLES {
            let exists: Option<i64> = sqlx::query_scalar(
                "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
            )
            .bind(table)
            .fetch_optional(&pool)
            .await
            .map_err(|e| BackupError::InvalidDatabase(e.to_string()))?;
            if exists.is_none() && !(table == "print_attempts" && version < CURRENT_SCHEMA_VERSION)
            {
                return Err(BackupError::InvalidDatabase(format!(
                    "required table {table} is missing"
                )));
            }
        }
        if version > CURRENT_SCHEMA_VERSION {
            return Err(BackupError::IncompatibleSchema(
                "backup was created by a newer ATE05 version".into(),
            ));
        }
        Ok(version)
    }
    .await;
    pool.close().await;
    result
}
pub async fn health(pool: &SqlitePool) -> DatabaseHealth {
    match async {
        let integrity: String = sqlx::query_scalar("PRAGMA integrity_check")
            .fetch_one(pool)
            .await
            .map_err(|e| e.to_string())?;
        if integrity != "ok" {
            return Err(integrity);
        }
        let version = schema_version(pool).await.map_err(|e| e.to_string())?;
        if version > CURRENT_SCHEMA_VERSION {
            return Err("database schema is newer than this application".into());
        }
        Ok(version)
    }
    .await
    {
        Ok(version) => DatabaseHealth {
            healthy: true,
            schema_version: version,
            message: "Database is healthy.".into(),
        },
        Err(error) => DatabaseHealth {
            healthy: false,
            schema_version: 0,
            message: format!("Database health check failed: {error}"),
        },
    }
}

pub async fn verify(path: &Path) -> Result<BackupInfo, BackupError> {
    if !path.is_dir() {
        return Err(BackupError::MissingFile(
            "backup artifact is not a directory".into(),
        ));
    }
    let manifest = read_manifest(path)?;
    if manifest.format_version != BACKUP_FORMAT_VERSION {
        return Err(BackupError::UnsupportedFormat(format!(
            "format {} is not supported",
            manifest.format_version
        )));
    }
    if manifest.database_file != DATABASE {
        return Err(BackupError::MalformedManifest(
            "database file is not database.sqlite".into(),
        ));
    }
    let database = path.join(DATABASE);
    if !database.is_file() {
        return Err(BackupError::MissingFile(
            "database snapshot is missing".into(),
        ));
    }
    let actual = sha256(&database)?;
    if actual != manifest.database_sha256 {
        return Err(BackupError::ChecksumMismatch(
            "database checksum does not match manifest".into(),
        ));
    }
    let schema = check_database(&database).await?;
    let size = fs::metadata(&database)
        .map_err(|e| BackupError::Disk(e.to_string()))?
        .len();
    Ok(BackupInfo {
        file_name: path
            .file_name()
            .and_then(|v| v.to_str())
            .unwrap_or_default()
            .into(),
        kind: kind_name(
            path.file_name()
                .and_then(|v| v.to_str())
                .unwrap_or_default(),
        )
        .into(),
        created_at: manifest.created_at,
        schema_version: schema,
        size_bytes: size,
        valid: true,
        format_version: manifest.format_version,
        app_version: manifest.app_version,
        backup_id: manifest.backup_id,
        checksum: actual,
        verification_status: "verified".into(),
    })
}
async fn vacuum_into(pool: &SqlitePool, destination: &Path) -> Result<(), BackupError> {
    let value = destination
        .to_str()
        .ok_or_else(|| BackupError::Disk("backup path is not valid".into()))?;
    sqlx::query("VACUUM INTO ?")
        .bind(value)
        .execute(pool)
        .await
        .map(|_| ())
        .map_err(|e| BackupError::Disk(format!("could not create database snapshot ({e})")))
}
async fn business_id(pool: &SqlitePool) -> Option<String> {
    sqlx::query_scalar("SELECT id FROM businesses ORDER BY created_at LIMIT 1")
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
}
pub async fn create(
    pool: &SqlitePool,
    backups_dir: &Path,
    kind: &str,
) -> Result<BackupInfo, String> {
    let storage = LocalBackupStorage::new(backups_dir.to_path_buf());
    fs::create_dir_all(storage.root()).map_err(|e| {
        BackupError::Disk(format!("backup folder is unavailable ({e})")).to_string()
    })?;
    let name = artifact_name(kind);
    let destination = storage.root().join(&name);
    if kind == "automatic" && destination.exists() {
        if let Ok(info) = verify(&destination).await {
            return Ok(info);
        }
        let _ = fs::remove_dir_all(&destination);
    }
    fs::create_dir_all(&destination).map_err(|e| BackupError::Disk(e.to_string()).to_string())?;
    let database = destination.join(DATABASE);
    if let Err(error) = vacuum_into(pool, &database).await {
        let _ = fs::remove_dir_all(&destination);
        return Err(error.to_string());
    }
    let schema = match check_database(&database).await {
        Ok(v) => v,
        Err(e) => {
            let _ = fs::remove_dir_all(&destination);
            return Err(e.to_string());
        }
    };
    let manifest = Manifest {
        format_version: BACKUP_FORMAT_VERSION,
        app_version: env!("CARGO_PKG_VERSION").into(),
        schema_version: schema,
        business_id: business_id(pool).await,
        created_at: now(),
        backup_id: Uuid::new_v4().to_string(),
        database_file: DATABASE.into(),
        database_sha256: sha256(&database).map_err(|e| e.to_string())?,
        encryption: "none".into(),
    };
    write_manifest(&destination.join(MANIFEST), &manifest).map_err(|e| e.to_string())?;
    verify(&destination).await.map_err(|e| e.to_string())
}
pub async fn export(pool: &SqlitePool, destination: &Path) -> Result<(), String> {
    if destination.extension().and_then(|v| v.to_str()) != Some("ate05backup") {
        return Err("validation: choose a destination ending in .ate05backup".into());
    }
    if destination.exists() {
        return Err("backup_failed: a backup with that name already exists".into());
    }
    let parent = destination
        .parent()
        .ok_or_else(|| "backup_failed: export destination has no parent".to_string())?;
    let created = create(pool, parent, "manual").await?;
    fs::rename(parent.join(&created.file_name), destination).map_err(|e| {
        BackupError::Disk(format!("could not write exported backup ({e})")).to_string()
    })
}
pub async fn list(backups_dir: &Path) -> Result<Vec<BackupInfo>, String> {
    if !backups_dir.exists() {
        return Ok(Vec::new());
    }
    let mut result = Vec::new();
    for entry in fs::read_dir(backups_dir)
        .map_err(|e| BackupError::Disk(e.to_string()).to_string())?
        .flatten()
    {
        let path = entry.path();
        if path.extension().and_then(|v| v.to_str()) != Some("ate05backup") {
            continue;
        }
        match verify(&path).await {
            Ok(info) => result.push(info),
            Err(_) => result.push(BackupInfo {
                file_name: entry.file_name().to_string_lossy().into(),
                kind: "unknown".into(),
                created_at: entry
                    .metadata()
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map(|d| d.as_secs() as i64)
                    .unwrap_or_else(now),
                schema_version: 0,
                size_bytes: 0,
                valid: false,
                format_version: 0,
                app_version: "unknown".into(),
                backup_id: "unknown".into(),
                checksum: String::new(),
                verification_status: "failed verification".into(),
            }),
        }
    }
    result.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(result)
}
pub fn delete(backups_dir: &Path, file_name: &str) -> Result<(), String> {
    LocalBackupStorage::new(backups_dir.to_path_buf())
        .delete(file_name)
        .map_err(|e| e.to_string())
}
pub fn retain_automatic(backups_dir: &Path) -> Result<(), String> {
    let mut entries = fs::read_dir(backups_dir)
        .map_err(|e| BackupError::Disk(e.to_string()).to_string())?
        .flatten()
        .filter(|e| {
            e.file_name()
                .to_string_lossy()
                .starts_with("ate05-backup-automatic-")
        })
        .collect::<Vec<_>>();
    entries.sort_by_key(|e| e.metadata().and_then(|m| m.modified()).ok());
    while entries.len() > AUTOMATIC_RETENTION {
        let entry = entries.remove(0);
        fs::remove_dir_all(entry.path())
            .map_err(|e| BackupError::Disk(e.to_string()).to_string())?;
    }
    Ok(())
}
pub async fn ensure_daily(pool: &SqlitePool, backups_dir: &Path) -> Result<BackupInfo, String> {
    let info = create(pool, backups_dir, "automatic").await?;
    retain_automatic(backups_dir)?;
    Ok(info)
}
pub async fn restore(
    pool: SqlitePool,
    database_path: &Path,
    backups_dir: &Path,
    file_name: &str,
) -> Result<(SqlitePool, BackupInfo), String> {
    let selected = safe_artifact_path(backups_dir, file_name).map_err(|e| e.to_string())?;
    let info = verify(&selected).await.map_err(|e| e.to_string())?;
    create(&pool, backups_dir, "pre_restore").await?;
    let temporary = database_path.with_extension("restore.tmp");
    let previous = database_path.with_extension("swap.tmp");
    let _ = fs::remove_file(&temporary);
    let _ = fs::remove_file(&previous);
    fs::copy(selected.join(DATABASE), &temporary)
        .map_err(|e| BackupError::Restore(format!("could not stage backup ({e})")).to_string())?;
    database::migrate_path(&temporary).await.map_err(|e| {
        BackupError::Restore(format!("migrations could not be applied ({e})")).to_string()
    })?;
    let staged = database::connect(&temporary).await.map_err(|e| {
        BackupError::Restore(format!("staged backup could not open ({e})")).to_string()
    })?;
    let staged_health = health(&staged).await;
    staged.close().await;
    if !staged_health.healthy {
        let _ = fs::remove_file(&temporary);
        return Err(BackupError::Restore(staged_health.message).to_string());
    }
    pool.close().await;
    if database_path.exists() {
        fs::rename(database_path, &previous).map_err(|e| {
            BackupError::Restore(format!("could not stage current database ({e})")).to_string()
        })?;
    }
    if let Err(error) = fs::rename(&temporary, database_path) {
        let _ = fs::rename(&previous, database_path);
        let _ = fs::remove_file(&temporary);
        return Err(
            BackupError::Restore(format!("could not install restored database ({error})"))
                .to_string(),
        );
    }
    let _ = fs::remove_file(&previous);
    let new_pool = database::connect(database_path).await.map_err(|e| {
        BackupError::Restore(format!("restored database could not reopen ({e})")).to_string()
    })?;
    let final_health = health(&new_pool).await;
    if !final_health.healthy {
        return Err(BackupError::Restore(final_health.message).to_string());
    }
    Ok((new_pool, info))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn root(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("ate05-backup-{name}-{}", Uuid::new_v4()))
    }
    async fn fixture(root: &Path) -> (PathBuf, SqlitePool) {
        fs::create_dir_all(root).unwrap();
        let db = root.join("ate05.db");
        fs::File::create(&db).unwrap();
        database::migrate_path(&db).await.unwrap();
        let pool = database::connect(&db).await.unwrap();
        sqlx::query("INSERT INTO businesses (id, name, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").bind("business-1").bind("Known POS").bind(true).bind("2026-09-11T00:00:00Z").bind("2026-09-11T00:00:00Z").execute(&pool).await.unwrap();
        (db, pool)
    }
    #[test]
    fn backup_verify_corruption_and_restore() {
        tauri::async_runtime::block_on(async {
            let root = root("integration");
            let (db, pool) = fixture(&root).await;
            let dir = root.join("backups");
            let backup = create(&pool, &dir, "manual").await.unwrap();
            assert!(verify(&dir.join(&backup.file_name)).await.is_ok());
            fs::write(dir.join(&backup.file_name).join(DATABASE), b"corrupt").unwrap();
            assert!(matches!(
                verify(&dir.join(&backup.file_name)).await,
                Err(BackupError::ChecksumMismatch(_))
            ));
            fs::remove_dir_all(dir.join(&backup.file_name)).unwrap();
            let backup = create(&pool, &root.join("backups"), "manual")
                .await
                .unwrap();
            sqlx::query("DELETE FROM businesses")
                .execute(&pool)
                .await
                .unwrap();
            let (restored, _) = restore(pool, &db, &root.join("backups"), &backup.file_name)
                .await
                .unwrap();
            let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM businesses")
                .fetch_one(&restored)
                .await
                .unwrap();
            assert_eq!(count, 1);
            restored.close().await;
            assert!(fs::read_dir(root.join("backups"))
                .unwrap()
                .flatten()
                .any(|e| e
                    .file_name()
                    .to_string_lossy()
                    .starts_with("ate05-backup-pre_restore-")));
            let _ = fs::remove_dir_all(root);
        });
    }
}
