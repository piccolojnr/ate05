use crate::database;
use serde::Serialize;
use sqlx::sqlite::SqlitePool;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const CURRENT_SCHEMA_VERSION: i64 = 6;
const AUTOMATIC_RETENTION: usize = 14;
const EXPECTED_TABLES: [&str; 17] = [
    "businesses",
    "users",
    "menu_categories",
    "menu_items",
    "menu_item_price_options",
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
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseHealth {
    pub healthy: bool,
    pub schema_version: i64,
    pub message: String,
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or_default()
}

fn day() -> i64 {
    now() / 86_400
}

fn backup_kind(file_name: &str) -> &'static str {
    if file_name.starts_with("ate05-backup-automatic-") {
        "automatic"
    } else if file_name.starts_with("ate05-backup-pre-restore-") {
        "pre_restore"
    } else {
        "manual"
    }
}

fn safe_backup_path(backups_dir: &Path, file_name: &str) -> Result<PathBuf, String> {
    let path = Path::new(file_name);
    if path.file_name().and_then(|name| name.to_str()) != Some(file_name)
        || !file_name.ends_with(".sqlite")
    {
        return Err("invalid_backup: choose a valid ATE05 backup".into());
    }
    Ok(backups_dir.join(file_name))
}

async fn schema_version(pool: &SqlitePool) -> Result<i64, String> {
    sqlx::query_scalar::<_, i64>(
        "SELECT COALESCE(MAX(version), 0) FROM _sqlx_migrations WHERE success = 1",
    )
    .fetch_one(pool)
    .await
    .map_err(|error| format!("invalid_backup: migration metadata is missing ({error})"))
}

pub async fn health(pool: &SqlitePool) -> DatabaseHealth {
    let result: Result<i64, String> = async {
        let integrity: String = sqlx::query_scalar("PRAGMA integrity_check")
            .fetch_one(pool)
            .await
            .map_err(|error| error.to_string())?;
        if integrity != "ok" {
            return Err(format!("integrity check returned {integrity}"));
        }
        let foreign_key_errors = sqlx::query("PRAGMA foreign_key_check")
            .fetch_all(pool)
            .await
            .map_err(|error| error.to_string())?;
        if !foreign_key_errors.is_empty() {
            return Err("foreign-key check found inconsistent records".into());
        }
        let version = schema_version(pool).await?;
        if version > CURRENT_SCHEMA_VERSION {
            return Err("database schema is newer than this application".into());
        }
        Ok(version)
    }
    .await;

    match result {
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

pub async fn validate(path: &Path) -> Result<BackupInfo, String> {
    if !path.is_file() {
        return Err("invalid_backup: backup file could not be found".into());
    }
    let pool = database::connect(path)
        .await
        .map_err(|error| format!("invalid_backup: backup could not be opened ({error})"))?;
    let result = async {
        let integrity: String = sqlx::query_scalar("PRAGMA integrity_check")
            .fetch_one(&pool)
            .await
            .map_err(|error| format!("invalid_backup: integrity check failed ({error})"))?;
        if integrity != "ok" {
            return Err(format!(
                "invalid_backup: integrity check returned {integrity}"
            ));
        }
        let foreign_key_errors = sqlx::query("PRAGMA foreign_key_check")
            .fetch_all(&pool)
            .await
            .map_err(|error| format!("invalid_backup: foreign-key check failed ({error})"))?;
        if !foreign_key_errors.is_empty() {
            return Err("invalid_backup: foreign-key check found inconsistent records".into());
        }
        let version = schema_version(&pool).await?;
        for table in EXPECTED_TABLES {
            let exists: Option<i64> = sqlx::query_scalar(
                "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
            )
            .bind(table)
            .fetch_optional(&pool)
            .await
            .map_err(|error| format!("invalid_backup: schema check failed ({error})"))?;
            if exists.is_none() {
                if (table == "print_attempts" && version < 4)
                    || (table == "menu_item_price_options" && version < 6)
                {
                    continue;
                }
                return Err(format!(
                    "invalid_backup: backup is missing required table {table}"
                ));
            }
        }
        if version > CURRENT_SCHEMA_VERSION {
            return Err(
                "incompatible_schema: this backup was created by a newer version of ATE05".into(),
            );
        }
        Ok(version)
    }
    .await;
    pool.close().await;

    let version = result?;
    let metadata = fs::metadata(path)
        .map_err(|error| format!("invalid_backup: backup metadata unavailable ({error})"))?;
    Ok(BackupInfo {
        file_name: path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default()
            .into(),
        kind: backup_kind(
            path.file_name()
                .and_then(|name| name.to_str())
                .unwrap_or_default(),
        )
        .into(),
        created_at: metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_secs() as i64)
            .unwrap_or_else(now),
        schema_version: version,
        size_bytes: metadata.len(),
        valid: true,
    })
}

async fn vacuum_into(pool: &SqlitePool, destination: &Path) -> Result<(), String> {
    let destination = destination
        .to_str()
        .ok_or_else(|| "backup_failed: backup path is not valid".to_string())?;
    sqlx::query("VACUUM INTO ?")
        .bind(destination)
        .execute(pool)
        .await
        .map(|_| ())
        .map_err(|error| format!("backup_failed: could not create database snapshot ({error})"))
}

pub async fn create(
    pool: &SqlitePool,
    backups_dir: &Path,
    kind: &str,
) -> Result<BackupInfo, String> {
    fs::create_dir_all(backups_dir)
        .map_err(|error| format!("backup_failed: backup folder is unavailable ({error})"))?;
    let file_name = match kind {
        "automatic" => format!("ate05-backup-automatic-{}.sqlite", day()),
        "pre_restore" => format!("ate05-backup-pre-restore-{}.sqlite", now()),
        _ => format!("ate05-backup-manual-{}.sqlite", now()),
    };
    let destination = backups_dir.join(&file_name);
    if destination.exists() {
        match validate(&destination).await {
            Ok(info) => return Ok(info),
            Err(_error) if kind == "automatic" => {
                fs::remove_file(&destination).map_err(|remove_error| {
                    format!("backup_failed: invalid daily backup could not be replaced ({remove_error})")
                })?;
            }
            Err(error) => return Err(error),
        }
    }
    vacuum_into(pool, &destination).await?;
    match validate(&destination).await {
        Ok(info) => Ok(info),
        Err(error) => {
            let _ = fs::remove_file(destination);
            Err(error)
        }
    }
}

pub async fn export(pool: &SqlitePool, destination: &Path) -> Result<(), String> {
    if destination.extension().and_then(|value| value.to_str()) != Some("sqlite") {
        return Err("validation: choose a destination ending in .sqlite".into());
    }
    if destination.exists() {
        return Err("backup_failed: a backup with that name already exists".into());
    }
    let temporary = destination.with_extension("sqlite.tmp");
    if temporary.exists() {
        fs::remove_file(&temporary)
            .map_err(|error| format!("backup_failed: could not prepare export ({error})"))?;
    }
    vacuum_into(pool, &temporary).await?;
    if validate(&temporary).await.is_err() {
        let _ = fs::remove_file(&temporary);
        return Err("backup_failed: exported backup failed validation".into());
    }
    fs::rename(&temporary, destination)
        .map_err(|error| format!("backup_failed: could not write exported backup ({error})"))?;
    Ok(())
}

pub async fn list(backups_dir: &Path) -> Result<Vec<BackupInfo>, String> {
    if !backups_dir.exists() {
        return Ok(Vec::new());
    }
    let mut backups = Vec::new();
    for entry in fs::read_dir(backups_dir)
        .map_err(|error| format!("backup_failed: could not read backup folder ({error})"))?
    {
        let entry =
            entry.map_err(|error| format!("backup_failed: could not read backup ({error})"))?;
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("sqlite") {
            continue;
        }
        if let Ok(info) = validate(&path).await {
            backups.push(info);
        }
    }
    backups.sort_by(|left, right| right.created_at.cmp(&left.created_at));
    Ok(backups)
}

pub fn retain_automatic(backups_dir: &Path) -> Result<(), String> {
    let mut automatic = fs::read_dir(backups_dir)
        .map_err(|error| format!("backup_failed: could not apply retention ({error})"))?
        .filter_map(Result::ok)
        .filter(|entry| {
            entry
                .file_name()
                .to_str()
                .map(|name| {
                    name.starts_with("ate05-backup-automatic-") && name.ends_with(".sqlite")
                })
                .unwrap_or(false)
        })
        .collect::<Vec<_>>();
    automatic.sort_by_key(|entry| {
        entry
            .metadata()
            .and_then(|metadata| metadata.modified())
            .ok()
    });
    while automatic.len() > AUTOMATIC_RETENTION {
        if let Some(entry) = automatic.first() {
            fs::remove_file(entry.path())
                .map_err(|error| format!("backup_failed: could not remove old backup ({error})"))?;
        }
        automatic.remove(0);
    }
    Ok(())
}

pub async fn ensure_daily(pool: &SqlitePool, backups_dir: &Path) -> Result<BackupInfo, String> {
    let result = create(pool, backups_dir, "automatic").await?;
    retain_automatic(backups_dir)?;
    Ok(result)
}

pub async fn restore(
    pool: SqlitePool,
    database_path: &Path,
    backups_dir: &Path,
    file_name: &str,
) -> Result<(SqlitePool, BackupInfo), String> {
    let selected = safe_backup_path(backups_dir, file_name)?;
    let info = validate(&selected).await?;
    let safety = create(&pool, backups_dir, "pre_restore").await?;
    let temporary = database_path.with_extension("restore.tmp");
    let _ = fs::remove_file(&temporary);
    fs::copy(&selected, &temporary)
        .map_err(|error| format!("restore_failed: could not stage backup ({error})"))?;
    database::migrate_path(&temporary)
        .await
        .map_err(|error| format!("restore_failed: migrations could not be applied ({error})"))?;
    let temporary_pool = database::connect(&temporary)
        .await
        .map_err(|error| format!("restore_failed: staged backup could not open ({error})"))?;
    let migrated_health = health(&temporary_pool).await;
    temporary_pool.close().await;
    if !migrated_health.healthy {
        let _ = fs::remove_file(&temporary);
        return Err(format!("restore_failed: {}", migrated_health.message));
    }
    pool.close().await;
    #[cfg(windows)]
    if database_path.exists() {
        fs::remove_file(database_path).map_err(|error| {
            format!("restore_failed: current database could not be replaced ({error})")
        })?;
    }
    fs::rename(&temporary, database_path).map_err(|error| {
        format!("restore_failed: restored database could not be installed ({error})")
    })?;
    let new_pool = database::connect(database_path)
        .await
        .map_err(|error| format!("restore_failed: restored database could not reopen ({error})"))?;
    let final_health = health(&new_pool).await;
    if !final_health.healthy {
        new_pool.close().await;
        return Err(format!("restore_failed: {}", final_health.message));
    }
    let _ = safety;
    Ok((new_pool, info))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_directory(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("ate05-{name}-{}-{}", std::process::id(), now()))
    }

    #[test]
    fn creates_and_validates_a_consistent_snapshot() {
        tauri::async_runtime::block_on(async {
            let root = test_directory("backup");
            fs::create_dir_all(&root).unwrap();
            let database_path = root.join("ate05.db");
            fs::File::create(&database_path).unwrap();
            database::migrate_path(&database_path).await.unwrap();
            let pool = database::connect(&database_path).await.unwrap();
            sqlx::query(
                "INSERT INTO businesses (id, name, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            )
                .bind("business-1")
                .bind("Before restore")
                .bind(true)
                .bind("2026-09-11T00:00:00Z")
                .bind("2026-09-11T00:00:00Z")
                .execute(&pool)
                .await
                .unwrap();
            let info = create(&pool, &root.join("backups"), "manual")
                .await
                .unwrap();
            assert!(info.valid);
            assert_eq!(info.schema_version, 6);
            let backup_path = root.join("backups").join(info.file_name);
            let backup_pool = database::connect(&backup_path).await.unwrap();
            let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM businesses")
                .fetch_one(&backup_pool)
                .await
                .unwrap();
            assert_eq!(count, 1);
            backup_pool.close().await;
            pool.close().await;
            let _ = fs::remove_dir_all(root);
        });
    }

    #[test]
    fn rejects_corrupted_snapshots_and_keeps_daily_backup_idempotent() {
        tauri::async_runtime::block_on(async {
            let root = test_directory("corrupt");
            fs::create_dir_all(&root).unwrap();
            let database_path = root.join("ate05.db");
            fs::File::create(&database_path).unwrap();
            let pool = database::connect(&database_path).await.unwrap();
            sqlx::query("CREATE TABLE _sqlx_migrations (version INTEGER, success INTEGER)")
                .execute(&pool)
                .await
                .unwrap();
            sqlx::query("INSERT INTO _sqlx_migrations VALUES (3, 1)")
                .execute(&pool)
                .await
                .unwrap();
            for table in EXPECTED_TABLES {
                sqlx::query(&format!("CREATE TABLE {table} (id INTEGER)"))
                    .execute(&pool)
                    .await
                    .unwrap();
            }
            let backups = root.join("backups");
            let first = ensure_daily(&pool, &backups).await.unwrap();
            let second = ensure_daily(&pool, &backups).await.unwrap();
            assert_eq!(first.file_name, second.file_name);
            fs::write(backups.join(&first.file_name), b"not sqlite").unwrap();
            assert!(validate(&backups.join(&first.file_name)).await.is_err());
            pool.close().await;
            let _ = fs::remove_dir_all(root);
        });
    }

    #[test]
    fn retention_only_removes_old_automatic_files() {
        let root = test_directory("retention");
        fs::create_dir_all(&root).unwrap();
        for day in 0..16 {
            fs::write(
                root.join(format!("ate05-backup-automatic-{day}.sqlite")),
                b"fixture",
            )
            .unwrap();
        }
        fs::write(root.join("ate05-backup-manual-1.sqlite"), b"fixture").unwrap();
        retain_automatic(&root).unwrap();
        let automatic_count = fs::read_dir(&root)
            .unwrap()
            .filter_map(Result::ok)
            .filter(|entry| entry.file_name().to_string_lossy().contains("automatic"))
            .count();
        assert_eq!(automatic_count, AUTOMATIC_RETENTION);
        assert!(root.join("ate05-backup-manual-1.sqlite").exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn restore_replaces_current_data_and_creates_a_safety_backup() {
        tauri::async_runtime::block_on(async {
            let root = test_directory("restore");
            fs::create_dir_all(&root).unwrap();
            let database_path = root.join("ate05.db");
            fs::File::create(&database_path).unwrap();
            database::migrate_path(&database_path).await.unwrap();
            let pool = database::connect(&database_path).await.unwrap();
            sqlx::query(
                "INSERT INTO businesses (id, name, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            )
                .bind("business-1")
                .bind("Before restore")
                .bind(true)
                .bind("2026-09-11T00:00:00Z")
                .bind("2026-09-11T00:00:00Z")
                .execute(&pool)
                .await
                .unwrap();
            let backups = root.join("backups");
            let snapshot = create(&pool, &backups, "manual").await.unwrap();
            sqlx::query(
                "INSERT INTO businesses (id, name, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            )
                .bind("business-2")
                .bind("After restore")
                .bind(true)
                .bind("2026-09-11T00:00:00Z")
                .bind("2026-09-11T00:00:00Z")
                .execute(&pool)
                .await
                .unwrap();
            let (restored_pool, _) = restore(pool, &database_path, &backups, &snapshot.file_name)
                .await
                .unwrap();
            let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM businesses")
                .fetch_one(&restored_pool)
                .await
                .unwrap();
            assert_eq!(count, 1);
            restored_pool.close().await;
            assert!(fs::read_dir(&backups)
                .unwrap()
                .filter_map(Result::ok)
                .any(|entry| entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with("ate05-backup-pre-restore-")));
            let _ = fs::remove_dir_all(root);
        });
    }
}
