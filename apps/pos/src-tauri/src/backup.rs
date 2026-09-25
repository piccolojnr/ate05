use crate::database;
use argon2::{Algorithm, Argon2, Params, Version};
use chacha20poly1305::{
    aead::{AeadInPlace, KeyInit},
    ChaCha20Poly1305, Key, Nonce, Tag,
};
use keyring::Entry;
use rand_core::{OsRng, RngCore};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::sqlite::SqlitePool;
use std::{
    fmt, fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tar::{Archive, Builder, Header};
use uuid::Uuid;

pub const BACKUP_FORMAT_VERSION: u32 = 2;
const PLAIN_BACKUP_FORMAT_VERSION: u32 = 3;
const LEGACY_FORMAT_VERSION: u32 = 1;
const CURRENT_SCHEMA_VERSION: i64 = 6;
const AUTOMATIC_RETENTION: usize = 14;
const MAGIC: &[u8; 8] = b"ATE05BK\0";
const SERVICE: &str = "com.ate05.pos";
const KEY_NAME: &str = "backup-recovery-key";
const CHUNK_SIZE: usize = 1024 * 1024;
const KDF_MEMORY_KIB: u32 = 19_456;
const KDF_ITERATIONS: u32 = 2;
const KDF_PARALLELISM: u32 = 1;
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
    pub format_version: u32,
    pub app_version: String,
    pub backup_id: String,
    pub checksum: String,
    pub verification_status: String,
    pub encrypted: bool,
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
    InvalidBackup(String),
    MissingFile(String),
    MalformedHeader(String),
    MalformedManifest(String),
    MalformedPayload(String),
    UnsupportedFormat(String),
    RecoveryRequired(String),
    AuthenticationFailure(String),
    ChecksumMismatch(String),
    IncompatibleSchema(String),
    InvalidDatabase(String),
    Disk(String),
    Restore(String),
}
impl fmt::Display for BackupError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidBackup(m) => write!(f, "invalid_backup: {m}"),
            Self::MissingFile(m) => write!(f, "missing_file: {m}"),
            Self::MalformedHeader(m) => write!(f, "malformed_header: {m}"),
            Self::MalformedManifest(m) => write!(f, "malformed_manifest: {m}"),
            Self::MalformedPayload(m) => write!(f, "malformed_payload: {m}"),
            Self::UnsupportedFormat(m) => write!(f, "unsupported_backup_format: {m}"),
            Self::RecoveryRequired(m) => write!(f, "recovery_credentials_required: {m}"),
            Self::AuthenticationFailure(m) => write!(f, "backup_authentication_failed: {m}"),
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
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OuterHeader {
    format_version: u32,
    encryption: String,
    kdf: String,
    salt: String,
    nonce: String,
    created_at: i64,
    backup_id: String,
    app_version: String,
    kind: String,
    kdf_memory_kib: u32,
    kdf_iterations: u32,
    kdf_parallelism: u32,
}

/// Providers enumerate opaque artifact files and delete them. Encryption,
/// snapshotting and restore remain provider-independent.
pub trait BackupStorage {
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
    fn delete(&self, file_name: &str) -> Result<(), BackupError> {
        let path = safe_path(&self.root, file_name)?;
        if path.is_dir() {
            fs::remove_dir_all(path)
        } else {
            fs::remove_file(path)
        }
        .map_err(|e| BackupError::Disk(format!("could not delete backup ({e})")))
    }
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or_default()
}
fn kind_name(name: &str) -> &'static str {
    if name.contains("automatic") {
        "automatic"
    } else if name.contains("pre_restore") || name.contains("pre-restore") {
        "pre_restore"
    } else if name.contains("manual") {
        "manual"
    } else {
        "unknown"
    }
}
fn file_name(_kind: &str, id: &str, created: i64) -> String {
    format!("ATE05-{}-{}.ate05backup", created, id)
}
fn safe_path(root: &Path, name: &str) -> Result<PathBuf, BackupError> {
    let p = Path::new(name);
    if p.file_name().and_then(|v| v.to_str()) != Some(name) || !name.ends_with(".ate05backup") {
        return Err(BackupError::MissingFile("invalid ATE05 backup name".into()));
    }
    Ok(root.join(name))
}
fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
fn unhex(value: &str) -> Result<Vec<u8>, BackupError> {
    if value.len() % 2 != 0 {
        return Err(BackupError::MalformedHeader(
            "invalid cryptographic metadata".into(),
        ));
    }
    (0..value.len())
        .step_by(2)
        .map(|i| {
            u8::from_str_radix(&value[i..i + 2], 16)
                .map_err(|_| BackupError::MalformedHeader("invalid cryptographic metadata".into()))
        })
        .collect()
}
fn sha256_file(path: &Path) -> Result<String, BackupError> {
    let mut file = fs::File::open(path).map_err(|e| BackupError::Disk(e.to_string()))?;
    let mut hash = Sha256::new();
    let mut buffer = [0u8; 1024 * 1024];
    loop {
        let count = file
            .read(&mut buffer)
            .map_err(|e| BackupError::Disk(e.to_string()))?;
        if count == 0 {
            break;
        }
        hash.update(&buffer[..count]);
    }
    Ok(format!("{:x}", hash.finalize()))
}
fn entry_name_safe(name: &Path) -> bool {
    !name.is_absolute()
        && name.components().all(|c| {
            !matches!(
                c,
                std::path::Component::ParentDir
                    | std::path::Component::RootDir
                    | std::path::Component::Prefix(_)
            )
        })
}

fn keyring_entry() -> Result<Entry, BackupError> {
    Entry::new(SERVICE, KEY_NAME)
        .map_err(|e| BackupError::Disk(format!("secure credential storage unavailable ({e})")))
}
fn derive_key(secret: &str, salt: &[u8]) -> Result<[u8; 32], BackupError> {
    let mut key = [0u8; 32];
    Argon2::new(
        Algorithm::Argon2id,
        Version::V0x13,
        Params::new(KDF_MEMORY_KIB, KDF_ITERATIONS, KDF_PARALLELISM, None)
            .map_err(|e| BackupError::Disk(format!("invalid KDF parameters ({e})")))?,
    )
    .hash_password_into(secret.as_bytes(), salt, &mut key)
    .map_err(|e| BackupError::Disk(format!("key derivation failed ({e})")))?;
    Ok(key)
}
fn recovery_key(provided: Option<&str>) -> Result<String, BackupError> {
    match provided {
        Some(value) if !value.is_empty() => Ok(value.to_owned()),
        _ => keyring_entry()?.get_password().map_err(|_| {
            BackupError::RecoveryRequired(
                "this older encrypted backup needs the original recovery key, which is not available on this computer".into(),
            )
        }),
    }
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
            if exists.is_none()
                && !((table == "print_attempts" && version < 4)
                    || (table == "menu_item_price_options" && version < 6))
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

fn write_header(file: &mut fs::File, header: &OuterHeader) -> Result<Vec<u8>, BackupError> {
    let bytes =
        serde_json::to_vec(header).map_err(|e| BackupError::MalformedHeader(e.to_string()))?;
    if bytes.len() > u32::MAX as usize {
        return Err(BackupError::MalformedHeader("header is too large".into()));
    }
    file.write_all(MAGIC)
        .and_then(|_| file.write_all(&(bytes.len() as u32).to_le_bytes()))
        .and_then(|_| file.write_all(&bytes))
        .map_err(|e| BackupError::Disk(e.to_string()))?;
    Ok(bytes)
}
fn read_header(file: &mut fs::File) -> Result<(OuterHeader, Vec<u8>), BackupError> {
    let mut magic = [0u8; 8];
    file.read_exact(&mut magic)
        .map_err(|_| BackupError::MalformedHeader("ATE05 backup signature is missing".into()))?;
    if &magic != MAGIC {
        return Err(BackupError::InvalidBackup(
            "file is not an ATE05 backup".into(),
        ));
    }
    let mut len = [0u8; 4];
    file.read_exact(&mut len)
        .map_err(|_| BackupError::MalformedHeader("header length is missing".into()))?;
    let length = u32::from_le_bytes(len) as usize;
    if length == 0 || length > 64 * 1024 {
        return Err(BackupError::MalformedHeader(
            "header length is invalid".into(),
        ));
    }
    let mut bytes = vec![0u8; length];
    file.read_exact(&mut bytes)
        .map_err(|_| BackupError::MalformedHeader("header is truncated".into()))?;
    let header =
        serde_json::from_slice(&bytes).map_err(|e| BackupError::MalformedHeader(e.to_string()))?;
    Ok((header, bytes))
}
fn chunk_nonce(base: &[u8], index: u32) -> Result<[u8; 12], BackupError> {
    if base.len() != 12 {
        return Err(BackupError::MalformedHeader("nonce is invalid".into()));
    }
    let mut nonce = [0u8; 12];
    nonce.copy_from_slice(base);
    let counter = u32::from_be_bytes([nonce[8], nonce[9], nonce[10], nonce[11]]) ^ index;
    nonce[8..].copy_from_slice(&counter.to_be_bytes());
    Ok(nonce)
}
fn encrypt_payload(
    input: &Path,
    output: &mut fs::File,
    header: &OuterHeader,
    header_bytes: &[u8],
    key: &[u8; 32],
) -> Result<(), BackupError> {
    let cipher = ChaCha20Poly1305::new(Key::from_slice(key));
    let nonce = unhex(&header.nonce)?;
    let mut input = fs::File::open(input).map_err(|e| BackupError::Disk(e.to_string()))?;
    let mut index = 0u32;
    loop {
        let mut chunk = vec![0u8; CHUNK_SIZE];
        let size = input
            .read(&mut chunk)
            .map_err(|e| BackupError::Disk(e.to_string()))?;
        if size == 0 {
            break;
        }
        chunk.truncate(size);
        let nonce = chunk_nonce(&nonce, index)?;
        let mut aad = header_bytes.to_vec();
        aad.extend_from_slice(&index.to_be_bytes());
        let tag = cipher
            .encrypt_in_place_detached(Nonce::from_slice(&nonce), &aad, &mut chunk)
            .map_err(|_| BackupError::AuthenticationFailure("could not encrypt backup".into()))?;
        output
            .write_all(&(chunk.len() as u32).to_le_bytes())
            .and_then(|_| output.write_all(&chunk))
            .and_then(|_| output.write_all(&tag))
            .map_err(|e| BackupError::Disk(e.to_string()))?;
        index = index
            .checked_add(1)
            .ok_or_else(|| BackupError::Disk("backup is too large".into()))?;
    }
    output
        .write_all(&0u32.to_le_bytes())
        .map_err(|e| BackupError::Disk(e.to_string()))?;
    Ok(())
}
fn decrypt_payload(
    input: &mut fs::File,
    output: &mut fs::File,
    header: &OuterHeader,
    header_bytes: &[u8],
    key: &[u8; 32],
) -> Result<(), BackupError> {
    let cipher = ChaCha20Poly1305::new(Key::from_slice(key));
    let nonce = unhex(&header.nonce)?;
    let mut index = 0u32;
    loop {
        let mut len = [0u8; 4];
        input
            .read_exact(&mut len)
            .map_err(|_| BackupError::MalformedPayload("encrypted payload is truncated".into()))?;
        let length = u32::from_le_bytes(len) as usize;
        if length == 0 {
            break;
        }
        if length > CHUNK_SIZE {
            return Err(BackupError::MalformedPayload(
                "encrypted chunk is too large".into(),
            ));
        }
        let mut chunk = vec![0u8; length];
        let mut tag_bytes = [0u8; 16];
        input
            .read_exact(&mut chunk)
            .and_then(|_| input.read_exact(&mut tag_bytes))
            .map_err(|_| BackupError::MalformedPayload("encrypted payload is truncated".into()))?;
        let nonce = chunk_nonce(&nonce, index)?;
        let mut aad = header_bytes.to_vec();
        aad.extend_from_slice(&index.to_be_bytes());
        cipher
            .decrypt_in_place_detached(
                Nonce::from_slice(&nonce),
                &aad,
                &mut chunk,
                Tag::from_slice(&tag_bytes),
            )
            .map_err(|_| {
                BackupError::AuthenticationFailure("backup authentication failed".into())
            })?;
        output
            .write_all(&chunk)
            .map_err(|e| BackupError::Disk(e.to_string()))?;
        index = index
            .checked_add(1)
            .ok_or_else(|| BackupError::MalformedPayload("too many encrypted chunks".into()))?;
    }
    Ok(())
}

fn append_bytes(
    builder: &mut Builder<fs::File>,
    name: &str,
    bytes: &[u8],
) -> Result<(), BackupError> {
    let mut header = Header::new_gnu();
    header
        .set_path(name)
        .map_err(|e| BackupError::Disk(e.to_string()))?;
    header.set_size(bytes.len() as u64);
    header.set_mode(0o600);
    header.set_cksum();
    builder
        .append(&header, bytes)
        .map_err(|e| BackupError::Disk(e.to_string()))
}
fn build_payload(manifest: &Path, database: &Path, target: &Path) -> Result<(), BackupError> {
    let file = fs::File::create(target).map_err(|e| BackupError::Disk(e.to_string()))?;
    let mut builder = Builder::new(file);
    let manifest_bytes = fs::read(manifest).map_err(|e| BackupError::Disk(e.to_string()))?;
    append_bytes(&mut builder, "manifest.json", &manifest_bytes)?;
    builder
        .append_path_with_name(database, "database.sqlite")
        .map_err(|e| BackupError::Disk(e.to_string()))?;
    builder
        .finish()
        .map_err(|e| BackupError::Disk(e.to_string()))
}
fn extract_payload(archive_path: &Path, target: &Path) -> Result<(), BackupError> {
    let file = fs::File::open(archive_path).map_err(|e| BackupError::Disk(e.to_string()))?;
    let mut archive = Archive::new(file);
    let mut seen = std::collections::HashSet::new();
    for item in archive
        .entries()
        .map_err(|e| BackupError::MalformedPayload(e.to_string()))?
    {
        let mut entry = item.map_err(|e| BackupError::MalformedPayload(e.to_string()))?;
        let path = entry
            .path()
            .map_err(|e| BackupError::MalformedPayload(e.to_string()))?
            .into_owned();
        if !entry_name_safe(&path)
            || !(path == Path::new("manifest.json") || path == Path::new("database.sqlite"))
            || !entry.header().entry_type().is_file()
            || !seen.insert(path.clone())
        {
            return Err(BackupError::MalformedPayload(
                "archive contains an unsafe or unexpected entry".into(),
            ));
        }
        entry
            .unpack(target.join(path))
            .map_err(|e| BackupError::MalformedPayload(e.to_string()))?;
    }
    if !seen.contains(Path::new("manifest.json")) || !seen.contains(Path::new("database.sqlite")) {
        return Err(BackupError::MissingFile(
            "encrypted payload is missing required files".into(),
        ));
    }
    Ok(())
}

async fn verify_legacy(path: &Path) -> Result<BackupInfo, BackupError> {
    let manifest: Manifest = serde_json::from_slice(
        &fs::read(path.join("manifest.json"))
            .map_err(|e| BackupError::MissingFile(format!("legacy manifest is missing ({e})")))?,
    )
    .map_err(|e| BackupError::MalformedManifest(e.to_string()))?;
    let db = path.join("database.sqlite");
    if manifest.format_version != LEGACY_FORMAT_VERSION {
        return Err(BackupError::UnsupportedFormat(format!(
            "legacy format {} is not supported",
            manifest.format_version
        )));
    }
    if sha256_file(&db)? != manifest.database_sha256 {
        return Err(BackupError::ChecksumMismatch(
            "legacy database checksum does not match manifest".into(),
        ));
    }
    let schema = check_database(&db).await?;
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
        size_bytes: fs::metadata(&db)
            .map_err(|e| BackupError::Disk(e.to_string()))?
            .len(),
        valid: true,
        format_version: LEGACY_FORMAT_VERSION,
        app_version: manifest.app_version,
        backup_id: manifest.backup_id,
        checksum: manifest.database_sha256,
        verification_status: "verified legacy plaintext".into(),
        encrypted: false,
    })
}
async fn verify_unencrypted(path: &Path) -> Result<BackupInfo, BackupError> {
    let staging = path.with_file_name(format!(".verify-{}", Uuid::new_v4()));
    fs::create_dir_all(&staging).map_err(|e| BackupError::Disk(e.to_string()))?;
    let result = verify_unencrypted_with_staging(path, &staging).await;
    let _ = fs::remove_dir_all(&staging);
    result
}
async fn verify_unencrypted_with_staging(
    path: &Path,
    staging: &Path,
) -> Result<BackupInfo, BackupError> {
    let mut file = fs::File::open(path).map_err(|e| BackupError::MissingFile(e.to_string()))?;
    let (header, _) = read_header(&mut file)?;
    if header.format_version != PLAIN_BACKUP_FORMAT_VERSION
        || header.encryption != "none"
        || header.kdf != "none"
    {
        return Err(BackupError::UnsupportedFormat(
            "plain backup format is not supported".into(),
        ));
    }
    let tar_path = staging.join("payload.tar");
    let mut tar = fs::File::create(&tar_path).map_err(|e| BackupError::Disk(e.to_string()))?;
    std::io::copy(&mut file, &mut tar).map_err(|e| BackupError::Disk(e.to_string()))?;
    tar.sync_all()
        .map_err(|e| BackupError::Disk(e.to_string()))?;
    extract_payload(&tar_path, staging)?;
    let manifest: Manifest = serde_json::from_slice(
        &fs::read(staging.join("manifest.json"))
            .map_err(|e| BackupError::MissingFile(e.to_string()))?,
    )
    .map_err(|e| BackupError::MalformedManifest(e.to_string()))?;
    if manifest.format_version != PLAIN_BACKUP_FORMAT_VERSION
        || manifest.database_file != "database.sqlite"
        || manifest.encryption != "none"
        || manifest.backup_id != header.backup_id
    {
        return Err(BackupError::MalformedManifest(
            "plain backup metadata is invalid".into(),
        ));
    }
    let db = staging.join("database.sqlite");
    let checksum = sha256_file(&db)?;
    if checksum != manifest.database_sha256 {
        return Err(BackupError::ChecksumMismatch(
            "database checksum does not match manifest".into(),
        ));
    }
    let schema = check_database(&db).await?;
    Ok(BackupInfo {
        file_name: path
            .file_name()
            .and_then(|v| v.to_str())
            .unwrap_or_default()
            .into(),
        kind: header.kind,
        created_at: manifest.created_at,
        schema_version: schema,
        size_bytes: fs::metadata(path)
            .map_err(|e| BackupError::Disk(e.to_string()))?
            .len(),
        valid: true,
        format_version: PLAIN_BACKUP_FORMAT_VERSION,
        app_version: manifest.app_version,
        backup_id: manifest.backup_id,
        checksum,
        verification_status: "verified (not encrypted)".into(),
        encrypted: false,
    })
}
async fn verify_file(path: &Path, supplied_key: Option<&str>) -> Result<BackupInfo, BackupError> {
    let mut file = fs::File::open(path).map_err(|e| BackupError::MissingFile(e.to_string()))?;
    let (header, _) = read_header(&mut file)?;
    match header.format_version {
        PLAIN_BACKUP_FORMAT_VERSION => verify_unencrypted(path).await,
        BACKUP_FORMAT_VERSION => verify_encrypted(path, supplied_key).await,
        _ => Err(BackupError::UnsupportedFormat("unsupported format".into())),
    }
}
async fn verify_encrypted(
    path: &Path,
    supplied_key: Option<&str>,
) -> Result<BackupInfo, BackupError> {
    let staging = path.with_file_name(format!(".verify-{}", Uuid::new_v4()));
    fs::create_dir_all(&staging).map_err(|e| BackupError::Disk(e.to_string()))?;
    let result = verify_encrypted_with_staging(path, supplied_key, &staging).await;
    let _ = fs::remove_dir_all(&staging);
    result
}
pub async fn verify_named_with_key(
    root: &Path,
    name: &str,
    supplied_key: Option<&str>,
) -> Result<BackupInfo, BackupError> {
    let path = safe_path(root, name)?;
    if path.is_dir() {
        verify_legacy(&path).await
    } else {
        verify_file(&path, supplied_key).await
    }
}

async fn snapshot(pool: &SqlitePool, target: &Path) -> Result<(), BackupError> {
    let value = target
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
    create_unencrypted(pool, backups_dir, kind).await
}
pub async fn create_cloud(
    pool: &SqlitePool,
    backups_dir: &Path,
    kind: &str,
) -> Result<BackupInfo, String> {
    create_unencrypted(pool, backups_dir, kind).await
}
async fn create_unencrypted(
    pool: &SqlitePool,
    backups_dir: &Path,
    kind: &str,
) -> Result<BackupInfo, String> {
    fs::create_dir_all(backups_dir).map_err(|e| BackupError::Disk(e.to_string()).to_string())?;
    let staging = backups_dir.join(format!(".create-{}", Uuid::new_v4()));
    fs::create_dir_all(&staging).map_err(|e| BackupError::Disk(e.to_string()).to_string())?;
    let result = async {
        let db = staging.join("database.sqlite");
        snapshot(pool, &db).await?;
        let schema = check_database(&db).await?;
        let id = Uuid::new_v4().to_string();
        let created = now();
        let manifest = Manifest {
            format_version: PLAIN_BACKUP_FORMAT_VERSION,
            app_version: env!("CARGO_PKG_VERSION").into(),
            schema_version: schema,
            business_id: business_id(pool).await,
            created_at: created,
            backup_id: id.clone(),
            database_file: "database.sqlite".into(),
            database_sha256: sha256_file(&db)?,
            encryption: "none".into(),
        };
        let manifest_path = staging.join("manifest.json");
        fs::write(
            &manifest_path,
            serde_json::to_vec_pretty(&manifest)
                .map_err(|e| BackupError::MalformedManifest(e.to_string()))?,
        )
        .map_err(|e| BackupError::Disk(e.to_string()))?;
        let payload = staging.join("payload.tar");
        build_payload(&manifest_path, &db, &payload)?;
        let header = OuterHeader {
            format_version: PLAIN_BACKUP_FORMAT_VERSION,
            encryption: "none".into(),
            kdf: "none".into(),
            salt: String::new(),
            nonce: String::new(),
            created_at: created,
            backup_id: id.clone(),
            app_version: env!("CARGO_PKG_VERSION").into(),
            kind: kind_name(kind).into(),
            kdf_memory_kib: 0,
            kdf_iterations: 0,
            kdf_parallelism: 0,
        };
        let temp_file = staging.join("backup.tmp");
        let mut output =
            fs::File::create(&temp_file).map_err(|e| BackupError::Disk(e.to_string()))?;
        write_header(&mut output, &header)?;
        let mut payload_file =
            fs::File::open(&payload).map_err(|e| BackupError::Disk(e.to_string()))?;
        std::io::copy(&mut payload_file, &mut output)
            .map_err(|e| BackupError::Disk(e.to_string()))?;
        output
            .sync_all()
            .map_err(|e| BackupError::Disk(e.to_string()))?;
        let final_name = file_name(kind, &id, created);
        let final_path = backups_dir.join(&final_name);
        fs::rename(&temp_file, &final_path)
            .map_err(|e| BackupError::Disk(format!("could not install backup ({e})")))?;
        verify_unencrypted(&final_path).await.map_err(|e| {
            let _ = fs::remove_file(&final_path);
            e
        })
    }
    .await;
    let _ = fs::remove_dir_all(&staging);
    result.map_err(|e: BackupError| e.to_string())
}
async fn create_with_key(
    pool: &SqlitePool,
    backups_dir: &Path,
    kind: &str,
    secret: &str,
) -> Result<BackupInfo, String> {
    fs::create_dir_all(backups_dir).map_err(|e| BackupError::Disk(e.to_string()).to_string())?;
    let staging = backups_dir.join(format!(".create-{}", Uuid::new_v4()));
    fs::create_dir_all(&staging).map_err(|e| BackupError::Disk(e.to_string()).to_string())?;
    let result = async {
        let db = staging.join("database.sqlite");
        snapshot(pool, &db).await?;
        let schema = check_database(&db).await?;
        let id = Uuid::new_v4().to_string();
        let created = now();
        let manifest = Manifest {
            format_version: BACKUP_FORMAT_VERSION,
            app_version: env!("CARGO_PKG_VERSION").into(),
            schema_version: schema,
            business_id: business_id(pool).await,
            created_at: created,
            backup_id: id.clone(),
            database_file: "database.sqlite".into(),
            database_sha256: sha256_file(&db)?,
            encryption: "chacha20-poly1305".into(),
        };
        let manifest_path = staging.join("manifest.json");
        fs::write(
            &manifest_path,
            serde_json::to_vec_pretty(&manifest)
                .map_err(|e| BackupError::MalformedManifest(e.to_string()))?,
        )
        .map_err(|e| BackupError::Disk(e.to_string()))?;
        let payload = staging.join("payload.tar");
        build_payload(&manifest_path, &db, &payload)?;
        let mut salt = [0u8; 16];
        let mut nonce = [0u8; 12];
        OsRng.fill_bytes(&mut salt);
        OsRng.fill_bytes(&mut nonce);
        let header = OuterHeader {
            format_version: BACKUP_FORMAT_VERSION,
            encryption: "chacha20-poly1305".into(),
            kdf: "argon2id".into(),
            salt: hex(&salt),
            nonce: hex(&nonce),
            created_at: created,
            backup_id: id.clone(),
            app_version: env!("CARGO_PKG_VERSION").into(),
            kind: kind_name(kind).into(),
            kdf_memory_kib: KDF_MEMORY_KIB,
            kdf_iterations: KDF_ITERATIONS,
            kdf_parallelism: KDF_PARALLELISM,
        };
        let temp_file = staging.join("backup.tmp");
        let mut output =
            fs::File::create(&temp_file).map_err(|e| BackupError::Disk(e.to_string()))?;
        let header_bytes = write_header(&mut output, &header)?;
        encrypt_payload(
            &payload,
            &mut output,
            &header,
            &header_bytes,
            &derive_key(secret, &salt)?,
        )?;
        output
            .sync_all()
            .map_err(|e| BackupError::Disk(e.to_string()))?;
        let final_name = file_name(kind, &id, created);
        let final_path = backups_dir.join(&final_name);
        fs::rename(&temp_file, &final_path)
            .map_err(|e| BackupError::Disk(format!("could not install backup ({e})")))?;
        verify_encrypted(&final_path, Some(secret))
            .await
            .map_err(|e| {
                let _ = fs::remove_file(&final_path);
                e
            })
    }
    .await;
    let _ = fs::remove_dir_all(&staging);
    result.map_err(|e: BackupError| e.to_string())
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
    let created = create_unencrypted(pool, parent, "manual").await?;
    fs::rename(parent.join(&created.file_name), destination)
        .map_err(|e| BackupError::Disk(e.to_string()).to_string())
}
#[cfg(test)]
async fn export_with_key(pool: &SqlitePool, destination: &Path, key: &str) -> Result<(), String> {
    if destination.extension().and_then(|v| v.to_str()) != Some("ate05backup") {
        return Err("validation: choose a destination ending in .ate05backup".into());
    }
    if destination.exists() {
        return Err("backup_failed: a backup with that name already exists".into());
    }
    let parent = destination
        .parent()
        .ok_or_else(|| "backup_failed: export destination has no parent".to_string())?;
    let created = create_with_key(pool, parent, "manual", key).await?;
    fs::rename(parent.join(&created.file_name), destination)
        .map_err(|e| BackupError::Disk(e.to_string()).to_string())
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
        if path.is_dir() {
            result.push(
                verify_legacy(&path)
                    .await
                    .unwrap_or_else(|_| invalid_info(&entry)),
            );
        } else {
            let plain = fs::File::open(&path)
                .ok()
                .and_then(|mut file| read_header(&mut file).ok())
                .is_some_and(|(header, _)| header.format_version == PLAIN_BACKUP_FORMAT_VERSION);
            if plain {
                result.push(
                    verify_unencrypted(&path)
                        .await
                        .unwrap_or_else(|_| invalid_info(&entry)),
                );
            } else {
                result.push(read_listing_info(&path).unwrap_or_else(|_| invalid_info(&entry)));
            }
        }
    }
    result.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(result)
}
fn invalid_info(entry: &fs::DirEntry) -> BackupInfo {
    BackupInfo {
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
        size_bytes: entry.metadata().map(|m| m.len()).unwrap_or(0),
        valid: false,
        format_version: 0,
        app_version: "unknown".into(),
        backup_id: "unknown".into(),
        checksum: String::new(),
        verification_status: "not verified".into(),
        encrypted: false,
    }
}
fn read_listing_info(path: &Path) -> Result<BackupInfo, BackupError> {
    let mut file = fs::File::open(path).map_err(|e| BackupError::Disk(e.to_string()))?;
    let (header, _) = read_header(&mut file)?;
    if header.format_version == PLAIN_BACKUP_FORMAT_VERSION {
        return Ok(BackupInfo {
            file_name: path
                .file_name()
                .and_then(|v| v.to_str())
                .unwrap_or_default()
                .into(),
            kind: header.kind,
            created_at: header.created_at,
            schema_version: 0,
            size_bytes: fs::metadata(path)
                .map_err(|e| BackupError::Disk(e.to_string()))?
                .len(),
            valid: false,
            format_version: header.format_version,
            app_version: header.app_version,
            backup_id: header.backup_id,
            checksum: String::new(),
            verification_status: "not verified".into(),
            encrypted: false,
        });
    }
    if header.format_version != BACKUP_FORMAT_VERSION {
        return Err(BackupError::UnsupportedFormat("unsupported format".into()));
    }
    if header.encryption != "chacha20-poly1305" || header.kdf != "argon2id" {
        return Err(BackupError::UnsupportedFormat(
            "encryption format is not supported".into(),
        ));
    }
    if header.kdf_memory_kib != KDF_MEMORY_KIB
        || header.kdf_iterations != KDF_ITERATIONS
        || header.kdf_parallelism != KDF_PARALLELISM
    {
        return Err(BackupError::UnsupportedFormat(
            "KDF parameters are not supported".into(),
        ));
    }
    Ok(BackupInfo {
        file_name: path
            .file_name()
            .and_then(|v| v.to_str())
            .unwrap_or_default()
            .into(),
        kind: header.kind.clone(),
        created_at: header.created_at,
        schema_version: 0,
        size_bytes: fs::metadata(path)
            .map_err(|e| BackupError::Disk(e.to_string()))?
            .len(),
        valid: false,
        format_version: header.format_version,
        app_version: header.app_version,
        backup_id: header.backup_id,
        checksum: String::new(),
        verification_status: "not verified".into(),
        encrypted: true,
    })
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
            if e.path().is_dir() {
                e.file_name().to_string_lossy().contains("automatic")
            } else {
                fs::File::open(e.path())
                    .ok()
                    .and_then(|mut file| read_header(&mut file).ok())
                    .map(|(header, _)| header.kind == "automatic")
                    .unwrap_or(false)
            }
        })
        .collect::<Vec<_>>();
    entries.sort_by_key(|e| e.metadata().and_then(|m| m.modified()).ok());
    while entries.len() > AUTOMATIC_RETENTION {
        let path = entries.remove(0).path();
        if path.is_dir() {
            fs::remove_dir_all(path)
        } else {
            fs::remove_file(path)
        }
        .map_err(|e| BackupError::Disk(e.to_string()).to_string())?;
    }
    Ok(())
}
pub async fn ensure_daily(pool: &SqlitePool, backups_dir: &Path) -> Result<BackupInfo, String> {
    let today = now() / 86_400;
    if let Ok(entries) = list(backups_dir).await {
        if let Some(existing) = entries
            .into_iter()
            .find(|b| b.kind == "automatic" && b.created_at / 86_400 == today)
        {
            if let Ok(verified) =
                verify_named_with_key(backups_dir, &existing.file_name, None).await
            {
                return Ok(verified);
            }
        }
    }
    let info = create(pool, backups_dir, "automatic").await?;
    retain_automatic(backups_dir)?;
    Ok(info)
}

pub async fn restore(
    pool: SqlitePool,
    database_path: &Path,
    backups_dir: &Path,
    file_name: &str,
    supplied_key: Option<&str>,
) -> Result<(SqlitePool, BackupInfo), String> {
    let selected = safe_path(backups_dir, file_name).map_err(|e| e.to_string())?;
    let staging = backups_dir.join(format!(".restore-{}", Uuid::new_v4()));
    fs::create_dir_all(&staging).map_err(|e| BackupError::Restore(e.to_string()).to_string())?;
    let result = async {
        let (info, plain_format) = if selected.is_dir() {
            (verify_legacy(&selected).await?, true)
        } else {
            let mut artifact =
                fs::File::open(&selected).map_err(|e| BackupError::MissingFile(e.to_string()))?;
            let (header, _) = read_header(&mut artifact)?;
            if header.format_version == PLAIN_BACKUP_FORMAT_VERSION {
                (
                    verify_unencrypted_with_staging(&selected, &staging).await?,
                    true,
                )
            } else {
                (
                    verify_encrypted_with_staging(&selected, supplied_key, &staging).await?,
                    false,
                )
            }
        };
        let source = if selected.is_dir() {
            selected.join("database.sqlite")
        } else {
            staging.join("database.sqlite")
        };
        if plain_format {
            create_unencrypted(&pool, backups_dir, "pre_restore")
                .await
                .map_err(BackupError::Restore)?;
        } else {
            let restore_secret = recovery_key(supplied_key)?;
            create_with_key(&pool, backups_dir, "pre_restore", &restore_secret)
                .await
                .map_err(BackupError::Restore)?;
        }
        let temporary = database_path.with_extension("restore.tmp");
        let previous = database_path.with_extension("swap.tmp");
        let _ = fs::remove_file(&temporary);
        let _ = fs::remove_file(&previous);
        fs::copy(source, &temporary)
            .map_err(|e| BackupError::Restore(format!("could not stage backup ({e})")))?;
        database::migrate_path(&temporary)
            .await
            .map_err(|e| BackupError::Restore(format!("migrations could not be applied ({e})")))?;
        let staged = database::connect(&temporary)
            .await
            .map_err(|e| BackupError::Restore(format!("staged backup could not open ({e})")))?;
        let staged_health = health(&staged).await;
        staged.close().await;
        if !staged_health.healthy {
            let _ = fs::remove_file(&temporary);
            return Err(BackupError::Restore(staged_health.message));
        }
        pool.close().await;
        if database_path.exists() {
            fs::rename(database_path, &previous).map_err(|e| {
                BackupError::Restore(format!("could not stage current database ({e})"))
            })?;
        }
        if let Err(e) = fs::rename(&temporary, database_path) {
            let _ = fs::rename(&previous, database_path);
            let _ = fs::remove_file(&temporary);
            return Err(BackupError::Restore(format!(
                "could not install restored database ({e})"
            )));
        }
        let _ = fs::remove_file(&previous);
        let new_pool = database::connect(database_path).await.map_err(|e| {
            BackupError::Restore(format!("restored database could not reopen ({e})"))
        })?;
        let final_health = health(&new_pool).await;
        if !final_health.healthy {
            return Err(BackupError::Restore(final_health.message));
        }
        Ok((new_pool, info))
    }
    .await;
    let _ = fs::remove_dir_all(&staging);
    result.map_err(|e: BackupError| e.to_string())
}
async fn verify_encrypted_with_staging(
    path: &Path,
    supplied_key: Option<&str>,
    staging: &Path,
) -> Result<BackupInfo, BackupError> {
    let mut file = fs::File::open(path).map_err(|e| BackupError::MissingFile(e.to_string()))?;
    let (header, bytes) = read_header(&mut file)?;
    if header.format_version != BACKUP_FORMAT_VERSION {
        return Err(BackupError::UnsupportedFormat("unsupported format".into()));
    }
    if header.encryption != "chacha20-poly1305" || header.kdf != "argon2id" {
        return Err(BackupError::UnsupportedFormat(
            "encryption format is not supported".into(),
        ));
    }
    if header.kdf_memory_kib != KDF_MEMORY_KIB
        || header.kdf_iterations != KDF_ITERATIONS
        || header.kdf_parallelism != KDF_PARALLELISM
    {
        return Err(BackupError::UnsupportedFormat(
            "KDF parameters are not supported".into(),
        ));
    }
    let key = derive_key(&recovery_key(supplied_key)?, &unhex(&header.salt)?)?;
    let tar_path = staging.join("payload.tar");
    let mut tar = fs::File::create(&tar_path).map_err(|e| BackupError::Disk(e.to_string()))?;
    decrypt_payload(&mut file, &mut tar, &header, &bytes, &key)?;
    tar.sync_all()
        .map_err(|e| BackupError::Disk(e.to_string()))?;
    extract_payload(&tar_path, staging)?;
    let manifest: Manifest = serde_json::from_slice(
        &fs::read(staging.join("manifest.json"))
            .map_err(|e| BackupError::MissingFile(e.to_string()))?,
    )
    .map_err(|e| BackupError::MalformedManifest(e.to_string()))?;
    if manifest.format_version != BACKUP_FORMAT_VERSION
        || manifest.database_file != "database.sqlite"
    {
        return Err(BackupError::MalformedManifest(
            "manifest format or database entry is invalid".into(),
        ));
    }
    let checksum = sha256_file(&staging.join("database.sqlite"))?;
    if checksum != manifest.database_sha256 {
        return Err(BackupError::ChecksumMismatch(
            "database checksum does not match manifest".into(),
        ));
    }
    let schema = check_database(&staging.join("database.sqlite")).await?;
    Ok(BackupInfo {
        file_name: path
            .file_name()
            .and_then(|v| v.to_str())
            .unwrap_or_default()
            .into(),
        kind: header.kind.clone(),
        created_at: manifest.created_at,
        schema_version: schema,
        size_bytes: fs::metadata(path)
            .map_err(|e| BackupError::Disk(e.to_string()))?
            .len(),
        valid: true,
        format_version: header.format_version,
        app_version: manifest.app_version,
        backup_id: manifest.backup_id,
        checksum,
        verification_status: "verified".into(),
        encrypted: true,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn root() -> PathBuf {
        std::env::temp_dir().join(format!("ate05-backup-{}", Uuid::new_v4()))
    }
    async fn fixture(root: &Path) -> (PathBuf, SqlitePool) {
        fs::create_dir_all(root).unwrap();
        let db = root.join("ate05.db");
        fs::File::create(&db).unwrap();
        database::migrate_path(&db).await.unwrap();
        let pool = database::connect(&db).await.unwrap();
        sqlx::query("INSERT INTO businesses (id, name, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").bind("business-1").bind("Known POS").bind(true).bind("2026-09-11T00:00:00Z").bind("2026-09-11T00:00:00Z").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO menu_categories (id, business_id, name, sort_order, active, created_at, updated_at) VALUES (?, ?, ?, 0, 1, ?, ?)").bind("category-1").bind("business-1").bind("Mains").bind("2026-09-11T00:00:00Z").bind("2026-09-11T00:00:00Z").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO menu_items (id, business_id, category_id, name, selling_price_minor, pricing_mode, available, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'options', 1, 1, ?, ?)").bind("item-1").bind("business-1").bind("category-1").bind("Tilapia").bind(0_i64).bind("2026-09-11T00:00:00Z").bind("2026-09-11T00:00:00Z").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO menu_item_price_options (id, business_id, menu_item_id, name, price_minor, sort_order, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 1, ?, ?)").bind("option-1").bind("business-1").bind("item-1").bind("Large").bind(11000_i64).bind("2026-09-11T00:00:00Z").bind("2026-09-11T00:00:00Z").execute(&pool).await.unwrap();
        (db, pool)
    }
    #[test]
    fn encrypted_single_file_round_trip_and_tamper_detection() {
        tauri::async_runtime::block_on(async {
            let root = root();
            let (_db, pool) = fixture(&root).await;
            let dir = root.join("backups");
            let key = "owner-recovery-key-for-test-1234567890";
            let info = create_with_key(&pool, &dir, "manual", key).await.unwrap();
            assert_eq!(info.schema_version, CURRENT_SCHEMA_VERSION);
            let path = dir.join(&info.file_name);
            assert!(path.is_file());
            assert!(!fs::read(&path)
                .unwrap()
                .windows(15)
                .any(|w| w == b"SQLite format 3"));
            assert!(verify_encrypted(&path, Some(key)).await.is_ok());
            let mut bytes = fs::read(&path).unwrap();
            let last = bytes.len() - 17;
            bytes[last] ^= 1;
            fs::write(&path, bytes).unwrap();
            assert!(matches!(
                verify_encrypted(&path, Some(key)).await,
                Err(BackupError::AuthenticationFailure(_))
            ));
            let _ = fs::remove_dir_all(root);
        });
    }
    #[test]
    fn restore_creates_safety_backup_and_wrong_key_preserves_live_db() {
        tauri::async_runtime::block_on(async {
            let root = root();
            let (db, pool) = fixture(&root).await;
            let dir = root.join("backups");
            let key = "owner-recovery-key-for-test-1234567890";
            let info = create_with_key(&pool, &dir, "manual", key).await.unwrap();
            let result = restore(pool, &db, &dir, &info.file_name, Some("wrong-key")).await;
            assert!(result.is_err());
            let check = database::connect(&db).await.unwrap();
            let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM businesses")
                .fetch_one(&check)
                .await
                .unwrap();
            assert_eq!(count, 1);
            check.close().await;
            let _ = fs::remove_dir_all(root);
        });
    }
    #[test]
    fn lists_exports_deletes_and_reads_legacy_artifacts() {
        tauri::async_runtime::block_on(async {
            let root = root();
            let (db, pool) = fixture(&root).await;
            let dir = root.join("backups");
            let key = "owner-recovery-key-for-test-1234567890";
            let info = create_with_key(&pool, &dir, "automatic", key)
                .await
                .unwrap();
            let listed = list(&dir).await.unwrap();
            assert_eq!(listed.len(), 1);
            assert_eq!(listed[0].kind, "automatic");
            assert_eq!(listed[0].verification_status, "not verified");
            assert!(verify_named_with_key(&dir, &info.file_name, Some(key))
                .await
                .is_ok());

            let exported = root.join("export.ate05backup");
            export_with_key(&pool, &exported, key).await.unwrap();
            assert!(exported.is_file());
            delete(&dir, &info.file_name).unwrap();
            assert!(!dir.join(&info.file_name).exists());

            let legacy = dir.join("ate05-backup-legacy.ate05backup");
            fs::create_dir_all(&legacy).unwrap();
            fs::copy(&db, legacy.join("database.sqlite")).unwrap();
            let legacy_manifest = Manifest {
                format_version: LEGACY_FORMAT_VERSION,
                app_version: "0.1.3".into(),
                schema_version: CURRENT_SCHEMA_VERSION,
                business_id: Some("business-1".into()),
                created_at: now(),
                backup_id: "legacy".into(),
                database_file: "database.sqlite".into(),
                database_sha256: sha256_file(&legacy.join("database.sqlite")).unwrap(),
                encryption: "none".into(),
            };
            fs::write(
                legacy.join("manifest.json"),
                serde_json::to_vec(&legacy_manifest).unwrap(),
            )
            .unwrap();
            let legacy_info = verify_named_with_key(&dir, "ate05-backup-legacy.ate05backup", None)
                .await
                .unwrap();
            assert!(!legacy_info.encrypted);
            let _ = fs::remove_dir_all(root);
        });
    }

    #[test]
    fn malformed_header_is_rejected_and_successful_restore_creates_safety_backup() {
        tauri::async_runtime::block_on(async {
            let root = root();
            let (db, pool) = fixture(&root).await;
            let dir = root.join("backups");
            fs::create_dir_all(&dir).unwrap();
            let malformed = dir.join("ATE05-1-bad.ate05backup");
            fs::write(&malformed, b"not an ATE05 backup").unwrap();
            assert!(matches!(
                verify_named_with_key(&dir, malformed.file_name().unwrap().to_str().unwrap(), None)
                    .await,
                Err(BackupError::InvalidBackup(_))
            ));
            let key = "owner-recovery-key-for-test-1234567890";
            let info = create_with_key(&pool, &dir, "manual", key).await.unwrap();
            sqlx::query(
                "UPDATE businesses SET name = 'Changed after backup' WHERE id = 'business-1'",
            )
            .execute(&pool)
            .await
            .unwrap();
            let (restored, _) = restore(pool, &db, &dir, &info.file_name, Some(key))
                .await
                .unwrap();
            let restored_option: (String, i64) = sqlx::query_as(
                "SELECT name, price_minor FROM menu_item_price_options WHERE id = 'option-1'",
            )
            .fetch_one(&restored)
            .await
            .unwrap();
            assert_eq!(restored_option, ("Large".into(), 11000));
            let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM businesses")
                .fetch_one(&restored)
                .await
                .unwrap();
            assert_eq!(count, 1);
            restored.close().await;
            assert!(list(&dir)
                .await
                .unwrap()
                .iter()
                .any(|entry| entry.kind == "pre_restore"));
            assert!(!root.join("backups/.restore").exists());
            let _ = fs::remove_dir_all(root);
        });
    }

    #[test]
    fn plain_backup_requires_no_recovery_key_and_restores_price_options() {
        tauri::async_runtime::block_on(async {
            let root = root();
            let (db, pool) = fixture(&root).await;
            let backups_dir = root.join("backups");
            let backup = create_cloud(&pool, &backups_dir, "manual").await.unwrap();
            assert_eq!(backup.format_version, PLAIN_BACKUP_FORMAT_VERSION);
            assert!(!backup.encrypted);
            assert_eq!(backup.schema_version, CURRENT_SCHEMA_VERSION);
            let verified = verify_named_with_key(&backups_dir, &backup.file_name, None)
                .await
                .unwrap();
            assert!(verified.valid);
            assert!(!verified.encrypted);

            sqlx::query(
                "UPDATE businesses SET name = 'Changed after backup' WHERE id = 'business-1'",
            )
            .execute(&pool)
            .await
            .unwrap();
            let (restored, _) = restore(pool, &db, &backups_dir, &backup.file_name, None)
                .await
                .unwrap();
            let option: (String, i64) = sqlx::query_as(
                "SELECT name, price_minor FROM menu_item_price_options WHERE id = 'option-1'",
            )
            .fetch_one(&restored)
            .await
            .unwrap();
            assert_eq!(option, ("Large".into(), 11000));
            assert!(list(&backups_dir)
                .await
                .unwrap()
                .iter()
                .any(|entry| entry.kind == "pre_restore" && !entry.encrypted));
            restored.close().await;
            let _ = fs::remove_dir_all(root);
        });
    }
}
