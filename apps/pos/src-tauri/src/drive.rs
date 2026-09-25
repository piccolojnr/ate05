use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use keyring::Entry;
use rand_core::{OsRng, RngCore};
use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    future::Future,
    io::{Read, Write},
    net::TcpListener,
    path::Path,
    process::Command,
    sync::{Mutex, OnceLock},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use url::Url;

pub const DRIVE_SCOPE: &str = "https://www.googleapis.com/auth/drive.file";
const DRIVE_API: &str = "https://www.googleapis.com/drive/v3";
const UPLOAD_API: &str = "https://www.googleapis.com/upload/drive/v3";
const AUTH_ENDPOINT: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT: &str = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT: &str = "https://oauth2.googleapis.com/revoke";
const OAUTH_SERVICE: &str = "com.ate05.pos";
const OAUTH_KEY: &str = "google-drive-oauth";
const STATE_KEY: &str = "google-drive-state";
const APP_ID: &str = "com.ate05.pos";
const FOLDER_NAME: &str = "ATE05 Backups";
const CHUNK_SIZE: usize = 8 * 1024 * 1024;

static OAUTH_ATTEMPT_ACTIVE: OnceLock<Mutex<bool>> = OnceLock::new();

fn oauth_attempt_active() -> &'static Mutex<bool> {
    OAUTH_ATTEMPT_ACTIVE.get_or_init(|| Mutex::new(false))
}

struct OAuthAttemptGuard;

impl OAuthAttemptGuard {
    fn acquire() -> Result<Self, CloudError> {
        let mut active = oauth_attempt_active().lock().map_err(|_| {
            CloudError::CallbackFailure("OAuth attempt state is unavailable".into())
        })?;
        if *active {
            return Err(CloudError::CallbackFailure(
                "another Google authorization attempt is already in progress".into(),
            ));
        }
        *active = true;
        Ok(Self)
    }
}

impl Drop for OAuthAttemptGuard {
    fn drop(&mut self) {
        if let Ok(mut active) = oauth_attempt_active().lock() {
            *active = false;
        }
    }
}

fn backup_id_from_name(name: &str) -> String {
    name.strip_prefix("ATE05-")
        .and_then(|value| value.strip_suffix(".ate05backup"))
        .and_then(|value| value.split_once('-').map(|(_, id)| id.to_owned()))
        .unwrap_or_else(|| name.to_owned())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudStatus {
    pub connected: bool,
    pub account_email: Option<String>,
    pub automatic_enabled: bool,
    pub status: String,
    pub last_success: Option<i64>,
    pub pending: usize,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteBackup {
    pub remote_id: String,
    pub name: String,
    pub size_bytes: u64,
    pub created_at: String,
    pub backup_id: Option<String>,
    pub status: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudBackupResult {
    pub local_file_name: String,
    pub remote: Option<RemoteBackup>,
    pub status: String,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case", tag = "code", content = "message")]
pub enum CloudError {
    NotConnected(String),
    AuthorizationRequired(String),
    AuthorizationCancelled(String),
    AuthorizationDenied(String),
    CallbackFailure(String),
    StateMismatch(String),
    TokenExchange(String),
    TokenRefresh(String),
    CredentialStoreUnavailable(String),
    NetworkUnavailable(String),
    Upload(String),
    Download(String),
    RemoteMissing(String),
    PermissionDenied(String),
    QuotaExceeded(String),
    RateLimited(String),
    Reconciliation(String),
}
impl std::fmt::Display for CloudError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotConnected(m) => write!(f, "cloud_not_connected: {m}"),
            Self::AuthorizationRequired(m) => write!(f, "authorization_required: {m}"),
            Self::AuthorizationCancelled(m) => write!(f, "authorization_cancelled: {m}"),
            Self::AuthorizationDenied(m) => write!(f, "authorization_denied: {m}"),
            Self::CallbackFailure(m) => write!(f, "oauth_callback_failure: {m}"),
            Self::StateMismatch(m) => write!(f, "oauth_state_mismatch: {m}"),
            Self::TokenExchange(m) => write!(f, "token_exchange_failed: {m}"),
            Self::TokenRefresh(m) => write!(f, "token_refresh_failed: {m}"),
            Self::CredentialStoreUnavailable(m) => {
                write!(f, "credential_store_unavailable: {m}")
            }
            Self::NetworkUnavailable(m) => write!(f, "network_unavailable: {m}"),
            Self::Upload(m) => write!(f, "cloud_upload_failed: {m}"),
            Self::Download(m) => write!(f, "cloud_download_failed: {m}"),
            Self::RemoteMissing(m) => write!(f, "remote_backup_missing: {m}"),
            Self::PermissionDenied(m) => write!(f, "remote_permission_denied: {m}"),
            Self::QuotaExceeded(m) => write!(f, "cloud_quota_exceeded: {m}"),
            Self::RateLimited(m) => write!(f, "cloud_rate_limited: {m}"),
            Self::Reconciliation(m) => write!(f, "cloud_reconciliation_failed: {m}"),
        }
    }
}
impl std::error::Error for CloudError {}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct OAuthStore {
    access_token: String,
    refresh_token: String,
    expires_at: i64,
    email: String,
    folder_id: Option<String>,
}
trait OAuthCredentialStore {
    fn read_oauth(&self) -> Result<OAuthStore, CloudError>;
    fn write_oauth(&self, store: &OAuthStore) -> Result<(), CloudError>;
}

struct SystemOAuthCredentialStore;

impl OAuthCredentialStore for SystemOAuthCredentialStore {
    fn read_oauth(&self) -> Result<OAuthStore, CloudError> {
        read_json(OAUTH_KEY)
    }

    fn write_oauth(&self, store: &OAuthStore) -> Result<(), CloudError> {
        write_json(OAUTH_KEY, store)
    }
}
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct CloudState {
    automatic_enabled: bool,
    last_success: Option<i64>,
    pending: Vec<String>,
    last_error: Option<String>,
}
#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: Option<String>,
    refresh_token: Option<String>,
    expires_in: Option<i64>,
    error: Option<String>,
}
#[derive(Debug, Deserialize)]
struct UserInfo {
    email: Option<String>,
}
#[derive(Debug, Deserialize)]
struct DriveFile {
    id: Option<String>,
    name: Option<String>,
    size: Option<String>,
    #[serde(rename = "createdTime")]
    created_time: Option<String>,
    #[serde(rename = "appProperties")]
    app_properties: Option<std::collections::HashMap<String, String>>,
}
#[derive(Debug, Deserialize)]
struct FileList {
    files: Option<Vec<DriveFile>>,
}

fn is_backup_artifact(
    name: &str,
    props: Option<&std::collections::HashMap<String, String>>,
) -> bool {
    name.ends_with(".ate05backup")
        && name != "ATE05 Recovery Envelope.ate05backup"
        && !props
            .and_then(|p| p.get("ate05_object_type"))
            .is_some_and(|v| v == "recovery_envelope")
}
fn entry(name: &str) -> Result<Entry, CloudError> {
    Entry::new(OAUTH_SERVICE, name).map_err(|e| {
        CloudError::CredentialStoreUnavailable(format!(
            "OS credential storage could not be opened ({e})"
        ))
    })
}
fn credential_read_error(error: keyring::Error) -> CloudError {
    match error {
        keyring::Error::NoEntry => {
            CloudError::NotConnected("Google Drive is not connected".into())
        }
        _ => CloudError::CredentialStoreUnavailable(
            "the saved Google Drive connection could not be read from the OS credential store; it may be locked".into(),
        ),
    }
}
fn read_json<T: for<'a> Deserialize<'a>>(name: &str) -> Result<T, CloudError> {
    let value = entry(name)?.get_password().map_err(credential_read_error)?;
    serde_json::from_str(&value)
        .map_err(|_| CloudError::Reconciliation("stored cloud state is invalid".into()))
}
fn write_json<T: Serialize>(name: &str, value: &T) -> Result<(), CloudError> {
    entry(name)?
        .set_password(
            &serde_json::to_string(value).map_err(|e| CloudError::Reconciliation(e.to_string()))?,
        )
        .map_err(|e| {
            CloudError::CredentialStoreUnavailable(format!(
                "OS credential storage could not save the Google Drive connection ({e})"
            ))
        })
}
fn load_oauth() -> Result<OAuthStore, CloudError> {
    SystemOAuthCredentialStore.read_oauth()
}

async fn refresh_oauth_if_needed<S, F, Fut>(
    credentials: &S,
    mut store: OAuthStore,
    now: i64,
    refresh: F,
) -> Result<(OAuthStore, String), CloudError>
where
    S: OAuthCredentialStore,
    F: FnOnce(OAuthStore) -> Fut,
    Fut: Future<Output = Result<TokenResponse, CloudError>>,
{
    if store.expires_at > now + 60 {
        return Ok((store.clone(), store.access_token));
    }

    let token = refresh(store.clone()).await?;
    let access_token = token.access_token.ok_or_else(|| {
        CloudError::AuthorizationRequired("Google did not return a refreshed access token".into())
    })?;
    if let Some(refresh_token) = token.refresh_token {
        store.refresh_token = refresh_token;
    }
    store.expires_at = now + token.expires_in.unwrap_or(3600).max(0);
    store.access_token = access_token.clone();
    credentials.write_oauth(&store)?;
    Ok((store, access_token))
}
fn load_state() -> CloudState {
    read_json(STATE_KEY).unwrap_or_default()
}
fn save_state(state: &CloudState) {
    let _ = write_json(STATE_KEY, state);
}
fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or_default()
}
fn client_id() -> Result<&'static str, CloudError> {
    option_env!("ATE05_GOOGLE_CLIENT_ID")
        .ok_or_else(|| CloudError::TokenExchange("ATE05_GOOGLE_CLIENT_ID is not configured".into()))
}
fn client_secret() -> Result<&'static str, CloudError> {
    option_env!("ATE05_GOOGLE_CLIENT_SECRET").ok_or_else(|| {
        CloudError::TokenExchange("ATE05_GOOGLE_CLIENT_SECRET is not configured".into())
    })
}
fn random_hex(size: usize) -> String {
    let mut bytes = vec![0u8; size];
    OsRng.fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
fn pkce_challenge(verifier: &str) -> String {
    let mut hash = Sha256::new();
    hash.update(verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(hash.finalize())
}
fn open_system_browser(url: &str) -> Result<(), CloudError> {
    #[cfg(target_os = "windows")]
    let result = Command::new("cmd").args(["/C", "start", "", url]).spawn();
    #[cfg(target_os = "macos")]
    let result = Command::new("open").arg(url).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let result = Command::new("xdg-open").arg(url).spawn();
    result
        .map(|_| ())
        .map_err(|e| CloudError::CallbackFailure(format!("could not open system browser ({e})")))
}
fn callback(listener: TcpListener, expected_state: String) -> Result<String, CloudError> {
    callback_with_timeout(listener, expected_state, Duration::from_secs(300))
}

fn callback_with_timeout(
    listener: TcpListener,
    expected_state: String,
    timeout: Duration,
) -> Result<String, CloudError> {
    listener
        .set_nonblocking(true)
        .map_err(|e| CloudError::CallbackFailure(e.to_string()))?;
    let deadline = std::time::Instant::now() + timeout;
    let (mut stream, _) = loop {
        match listener.accept() {
            Ok(connection) => break connection,
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                if std::time::Instant::now() >= deadline {
                    return Err(CloudError::CallbackFailure(
                        "OAuth callback timed out".into(),
                    ));
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(error) => return Err(CloudError::CallbackFailure(error.to_string())),
        }
    };
    stream.set_read_timeout(Some(Duration::from_secs(15))).ok();
    let mut request = [0u8; 8192];
    let size = stream
        .read(&mut request)
        .map_err(|e| CloudError::CallbackFailure(e.to_string()))?;
    let line = String::from_utf8_lossy(&request[..size])
        .lines()
        .next()
        .unwrap_or_default()
        .to_string();
    let target = line
        .split_whitespace()
        .nth(1)
        .ok_or_else(|| CloudError::CallbackFailure("malformed OAuth callback".into()))?;
    let url = Url::parse(&format!("http://localhost{target}"))
        .map_err(|_| CloudError::CallbackFailure("malformed OAuth callback".into()))?;
    let query: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
    let body =
        b"<html><body>ATE05 authorization completed. You may close this window.</body></html>";
    let response = format!("HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", body.len());
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.write_all(body);
    if query.get("state").map(String::as_str) != Some(expected_state.as_str()) {
        return Err(CloudError::StateMismatch(
            "OAuth state did not match".into(),
        ));
    }
    if let Some(error) = query.get("error") {
        return Err(if error == "access_denied" {
            CloudError::AuthorizationCancelled(
                "Google authorization was cancelled or denied".into(),
            )
        } else {
            CloudError::AuthorizationDenied("Google authorization was not granted".into())
        });
    }
    query
        .get("code")
        .cloned()
        .ok_or_else(|| CloudError::CallbackFailure("authorization code was missing".into()))
}
pub async fn connect() -> Result<CloudStatus, String> {
    let _attempt = OAuthAttemptGuard::acquire().map_err(|e| e.to_string())?;
    let id = client_id().map_err(|e| e.to_string())?.to_owned();
    let secret = client_secret().map_err(|e| e.to_string())?.to_owned();
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| CloudError::CallbackFailure(e.to_string()).to_string())?;
    let port = listener
        .local_addr()
        .map_err(|e| CloudError::CallbackFailure(e.to_string()).to_string())?
        .port();
    let state = random_hex(24);
    let verifier = random_hex(32);
    let redirect = format!("http://127.0.0.1:{port}/callback");
    let mut auth = Url::parse(AUTH_ENDPOINT).unwrap();
    auth.query_pairs_mut()
        .append_pair("client_id", &id)
        .append_pair("redirect_uri", &redirect)
        .append_pair("response_type", "code")
        .append_pair("scope", &format!("openid email {DRIVE_SCOPE}"))
        .append_pair("access_type", "offline")
        .append_pair("prompt", "consent")
        .append_pair("state", &state)
        .append_pair("code_challenge", &pkce_challenge(&verifier))
        .append_pair("code_challenge_method", "S256");
    open_system_browser(auth.as_str()).map_err(|e| e.to_string())?;
    let callback_state = state.clone();
    let code = tauri::async_runtime::spawn_blocking(move || callback(listener, callback_state))
        .await
        .map_err(|_| CloudError::CallbackFailure("OAuth callback worker failed".into()))
        .and_then(|r| r)
        .map_err(|e| e.to_string())?;
    let response = Client::new()
        .post(TOKEN_ENDPOINT)
        .form(&[
            ("client_id", id.as_str()),
            ("client_secret", secret.as_str()),
            ("code", code.as_str()),
            ("code_verifier", verifier.as_str()),
            ("grant_type", "authorization_code"),
            ("redirect_uri", redirect.as_str()),
        ])
        .send()
        .await
        .map_err(|e| CloudError::NetworkUnavailable(e.to_string()).to_string())?;
    let response_status = response.status();
    let token: TokenResponse = response.json().await.map_err(|_| {
        CloudError::TokenExchange("Google token response was invalid".into()).to_string()
    })?;
    if !response_status.is_success() {
        return Err(CloudError::TokenExchange(
            if token.error.as_deref() == Some("invalid_client") {
                "Google rejected the configured OAuth client".into()
            } else {
                "Google rejected the authorization request".into()
            },
        )
        .to_string());
    }
    let access = token
        .access_token
        .ok_or_else(|| CloudError::TokenExchange("access token was missing".into()).to_string())?;
    let email = Client::new()
        .get("https://openidconnect.googleapis.com/v1/userinfo")
        .bearer_auth(&access)
        .send()
        .await
        .map_err(|e| CloudError::NetworkUnavailable(e.to_string()).to_string())?
        .json::<UserInfo>()
        .await
        .map_err(|_| {
            CloudError::TokenExchange("Google account response was invalid".into()).to_string()
        })?
        .email
        .unwrap_or_else(|| "Connected Google account".into());
    let store = OAuthStore {
        access_token: access,
        refresh_token: token.refresh_token.ok_or_else(|| {
            CloudError::TokenExchange("Google did not return a refresh token".into()).to_string()
        })?,
        expires_at: now() + token.expires_in.unwrap_or(3600),
        email,
        folder_id: None,
    };
    SystemOAuthCredentialStore
        .write_oauth(&store)
        .map_err(|e| e.to_string())?;
    status().await
}
async fn access_token() -> Result<(OAuthStore, String), CloudError> {
    let credentials = SystemOAuthCredentialStore;
    let store = credentials.read_oauth()?;
    refresh_oauth_if_needed(&credentials, store, now(), refresh_token_remote).await
}

async fn refresh_token_remote(store: OAuthStore) -> Result<TokenResponse, CloudError> {
    let response = Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|_| CloudError::TokenRefresh("Google token client is unavailable".into()))?
        .post(TOKEN_ENDPOINT)
        .form(&[
            ("client_id", client_id()?),
            ("client_secret", client_secret()?),
            ("refresh_token", store.refresh_token.as_str()),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .await
        .map_err(|_| {
            CloudError::NetworkUnavailable(
                "Google could not be reached to refresh the saved connection".into(),
            )
        })?;
    let status = response.status();
    if status.is_server_error() || status == StatusCode::TOO_MANY_REQUESTS {
        return Err(CloudError::NetworkUnavailable(
            "Google could not refresh the saved connection right now".into(),
        ));
    }
    let token: TokenResponse = response
        .json()
        .await
        .map_err(|_| CloudError::TokenRefresh("Google token response was invalid".into()))?;
    if !status.is_success() {
        return Err(refresh_response_error(status, token.error.as_deref()));
    }
    Ok(token)
}

fn refresh_response_error(status: StatusCode, oauth_error: Option<&str>) -> CloudError {
    if oauth_error == Some("invalid_grant") {
        CloudError::AuthorizationRequired(
            "Google authorization expired or was revoked; reconnect Google Drive".into(),
        )
    } else if status.is_server_error() || status == StatusCode::TOO_MANY_REQUESTS {
        CloudError::NetworkUnavailable(
            "Google could not refresh the saved connection right now".into(),
        )
    } else {
        CloudError::TokenRefresh(
            "Google could not refresh the saved connection; reconnect may be required".into(),
        )
    }
}
async fn cloud_status_from<S, F, Fut>(
    credentials: &S,
    state: CloudState,
    now: i64,
    refresh: F,
) -> CloudStatus
where
    S: OAuthCredentialStore,
    F: FnOnce(OAuthStore) -> Fut,
    Fut: Future<Output = Result<TokenResponse, CloudError>>,
{
    let base = |connected, account_email, status: &str| CloudStatus {
        connected,
        account_email,
        automatic_enabled: state.automatic_enabled,
        status: status.into(),
        last_success: state.last_success,
        pending: state.pending.len(),
    };

    let store = match credentials.read_oauth() {
        Ok(store) => store,
        Err(CloudError::NotConnected(_)) => return base(false, None, "disconnected"),
        Err(CloudError::CredentialStoreUnavailable(_)) => {
            return base(false, None, "credential_store_unavailable");
        }
        Err(_) => return base(false, None, "needs_attention"),
    };
    let email = store.email.clone();
    match refresh_oauth_if_needed(credentials, store, now, refresh).await {
        Ok((store, _)) => base(
            true,
            Some(store.email),
            if state.last_error.is_some() {
                "needs_attention"
            } else if !state.pending.is_empty() {
                "pending"
            } else {
                "up_to_date"
            },
        ),
        Err(CloudError::NetworkUnavailable(_)) | Err(CloudError::RateLimited(_)) => {
            base(true, Some(email), "drive_unavailable")
        }
        Err(CloudError::AuthorizationRequired(_)) => base(false, None, "authorization_required"),
        Err(CloudError::CredentialStoreUnavailable(_)) => {
            base(false, None, "credential_store_unavailable")
        }
        Err(_) => base(false, None, "needs_attention"),
    }
}

pub async fn status() -> Result<CloudStatus, String> {
    Ok(cloud_status_from(
        &SystemOAuthCredentialStore,
        load_state(),
        now(),
        |store| async move { refresh_token_remote(store).await },
    )
    .await)
}
pub async fn set_automatic(enabled: bool) -> Result<CloudStatus, String> {
    let mut state = load_state();
    state.automatic_enabled = enabled;
    save_state(&state);
    status().await
}
pub async fn disconnect() -> Result<(), String> {
    if let Ok(store) = load_oauth() {
        let _ = Client::new()
            .post(REVOKE_ENDPOINT)
            .form(&[("token", store.refresh_token)])
            .send()
            .await;
    }
    let _ = entry(OAUTH_KEY).and_then(|e| {
        e.delete_credential()
            .map_err(|x| CloudError::TokenRefresh(x.to_string()))
    });
    let _ = entry(STATE_KEY).and_then(|e| {
        e.delete_credential()
            .map_err(|x| CloudError::TokenRefresh(x.to_string()))
    });
    Ok(())
}
async fn api_error(status: StatusCode) -> CloudError {
    match status {
        StatusCode::UNAUTHORIZED => CloudError::AuthorizationRequired(
            "Google authorization expired or was revoked; reconnect Google Drive".into(),
        ),
        StatusCode::FORBIDDEN => {
            CloudError::PermissionDenied("Google Drive denied this operation".into())
        }
        StatusCode::TOO_MANY_REQUESTS => {
            CloudError::RateLimited("Google Drive rate limit reached".into())
        }
        StatusCode::INSUFFICIENT_STORAGE => {
            CloudError::QuotaExceeded("Google Drive quota exceeded".into())
        }
        s if s.is_server_error() => {
            CloudError::NetworkUnavailable("Google Drive is temporarily unavailable".into())
        }
        _ => CloudError::Reconciliation("Google Drive returned an unexpected response".into()),
    }
}
async fn folder_id(store: &mut OAuthStore, token: &str) -> Result<String, CloudError> {
    if let Some(id) = &store.folder_id {
        return Ok(id.clone());
    }
    let q = format!(
        "name = '{}' and mimeType = 'application/vnd.google-apps.folder' and appProperties has {{ key='ate05_app_id' and value='{}' }} and trashed = false",
        FOLDER_NAME.replace('\'', "\\'"),
        APP_ID
    );
    let response = Client::new()
        .get(format!("{DRIVE_API}/files"))
        .bearer_auth(token)
        .query(&[
            ("q", q.as_str()),
            ("spaces", "drive"),
            ("fields", "files(id,name)"),
        ])
        .send()
        .await
        .map_err(|e| CloudError::NetworkUnavailable(e.to_string()))?;
    if !response.status().is_success() {
        return Err(api_error(response.status()).await);
    }
    if let Some(id) = response
        .json::<FileList>()
        .await
        .map_err(|_| CloudError::Reconciliation("Google Drive folder response was invalid".into()))?
        .files
        .and_then(|v| v.into_iter().find_map(|f| f.id))
    {
        store.folder_id = Some(id.clone());
        write_json(OAUTH_KEY, store)?;
        return Ok(id);
    }
    let body = serde_json::json!({"name": FOLDER_NAME, "mimeType": "application/vnd.google-apps.folder", "appProperties": {"ate05_app_id": APP_ID}});
    let response = Client::new()
        .post(format!("{DRIVE_API}/files"))
        .bearer_auth(token)
        .query(&[("fields", "id")])
        .json(&body)
        .send()
        .await
        .map_err(|e| CloudError::NetworkUnavailable(e.to_string()))?;
    if !response.status().is_success() {
        return Err(api_error(response.status()).await);
    }
    let id = response
        .json::<DriveFile>()
        .await
        .map_err(|_| CloudError::Reconciliation("Google Drive folder response was invalid".into()))?
        .id
        .ok_or_else(|| CloudError::Reconciliation("Google Drive folder ID was missing".into()))?;
    store.folder_id = Some(id.clone());
    write_json(OAUTH_KEY, store)?;
    Ok(id)
}
pub async fn list() -> Result<Vec<RemoteBackup>, String> {
    let (mut store, token) = access_token().await.map_err(|e| e.to_string())?;
    let folder = folder_id(&mut store, &token)
        .await
        .map_err(|e| e.to_string())?;
    let q = format!("'{}' in parents and trashed = false", folder);
    let response = Client::new()
        .get(format!("{DRIVE_API}/files"))
        .bearer_auth(token)
        .query(&[
            ("q", q.as_str()),
            ("spaces", "drive"),
            ("orderBy", "createdTime desc"),
            ("fields", "files(id,name,size,createdTime,appProperties)"),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(api_error(response.status()).await.to_string());
    }
    Ok(response
        .json::<FileList>()
        .await
        .map_err(|_| {
            CloudError::Reconciliation("Google Drive listing response was invalid".into())
                .to_string()
        })?
        .files
        .unwrap_or_default()
        .into_iter()
        .filter(|f| {
            f.name
                .as_deref()
                .is_some_and(|name| is_backup_artifact(name, f.app_properties.as_ref()))
        })
        .filter_map(|f| {
            Some(RemoteBackup {
                remote_id: f.id?,
                name: f.name?,
                size_bytes: f.size.and_then(|s| s.parse().ok()).unwrap_or_default(),
                created_at: f.created_time.unwrap_or_default(),
                backup_id: f
                    .app_properties
                    .as_ref()
                    .and_then(|p| p.get("ate05_backup_id"))
                    .cloned(),
                status: "remote_unverified".into(),
            })
        })
        .collect())
}

pub async fn upload_backup_file(path: &Path) -> Result<RemoteBackup, CloudError> {
    let (mut store, token) = access_token().await?;
    let folder = folder_id(&mut store, &token).await?;
    let name = path
        .file_name()
        .and_then(|v| v.to_str())
        .ok_or_else(|| CloudError::Upload("backup filename is invalid".into()))?
        .to_owned();
    let backup_id = backup_id_from_name(&name);
    let query = format!("'{}' in parents and appProperties has {{ key='ate05_backup_id' and value='{}' }} and trashed = false", folder, backup_id);
    let existing = Client::new()
        .get(format!("{DRIVE_API}/files"))
        .bearer_auth(&token)
        .query(&[
            ("q", query.as_str()),
            ("fields", "files(id,name,size,createdTime,appProperties)"),
        ])
        .send()
        .await
        .map_err(|e| CloudError::NetworkUnavailable(e.to_string()))?;
    if existing.status().is_success() {
        if let Some(remote) = existing
            .json::<FileList>()
            .await
            .ok()
            .and_then(|l| l.files)
            .and_then(|mut f| f.pop())
        {
            return Ok(to_remote(remote));
        }
    }
    let metadata = serde_json::json!({"name": name, "parents": [folder], "appProperties": {"ate05_app_id": APP_ID, "ate05_backup_id": backup_id, "ate05_format_version": "2"}});
    let init = Client::new()
        .post(format!("{UPLOAD_API}/files?uploadType=resumable"))
        .bearer_auth(&token)
        .query(&[
            ("uploadType", "resumable"),
            ("fields", "id,name,size,createdTime,appProperties"),
        ])
        .header("X-Upload-Content-Type", "application/octet-stream")
        .header(
            "X-Upload-Content-Length",
            fs::metadata(path)
                .map_err(|e| CloudError::Upload(e.to_string()))?
                .len(),
        )
        .json(&metadata)
        .send()
        .await
        .map_err(|e| CloudError::NetworkUnavailable(e.to_string()))?;
    if !init.status().is_success() {
        return Err(api_error(init.status()).await);
    }
    let location = init
        .headers()
        .get("location")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| CloudError::Upload("Google Drive upload session was missing".into()))?
        .to_owned();
    let mut input = fs::File::open(path).map_err(|e| CloudError::Upload(e.to_string()))?;
    let total = fs::metadata(path)
        .map_err(|e| CloudError::Upload(e.to_string()))?
        .len();
    let mut offset = 0u64;
    loop {
        let mut chunk = vec![0u8; CHUNK_SIZE];
        let size = input
            .read(&mut chunk)
            .map_err(|e| CloudError::Upload(e.to_string()))?;
        if size == 0 {
            break;
        }
        chunk.truncate(size);
        let end = offset + size as u64 - 1;
        let response = Client::new()
            .put(&location)
            .header("Content-Length", size)
            .header(
                "Content-Range",
                format!("bytes {}-{}/{}", offset, end, total),
            )
            .body(chunk)
            .send()
            .await
            .map_err(|e| CloudError::NetworkUnavailable(e.to_string()))?;
        if response.status().is_server_error() || response.status() == StatusCode::TOO_MANY_REQUESTS
        {
            return Err(api_error(response.status()).await);
        }
        if !(response.status().is_success() || response.status() == StatusCode::PERMANENT_REDIRECT)
        {
            return Err(api_error(response.status()).await);
        }
        if response.status().is_success() {
            return Ok(to_remote(response.json::<DriveFile>().await.map_err(
                |_| CloudError::Upload("Google Drive upload response was invalid".into()),
            )?));
        }
        offset = end + 1;
    }
    Err(CloudError::Upload(
        "Google Drive upload did not complete".into(),
    ))
}
fn to_remote(file: DriveFile) -> RemoteBackup {
    RemoteBackup {
        remote_id: file.id.unwrap_or_default(),
        name: file.name.unwrap_or_default(),
        size_bytes: file.size.and_then(|s| s.parse().ok()).unwrap_or_default(),
        created_at: file.created_time.unwrap_or_default(),
        backup_id: file
            .app_properties
            .as_ref()
            .and_then(|p| p.get("ate05_backup_id"))
            .cloned(),
        status: "uploaded".into(),
    }
}
pub async fn download(remote_id: &str, destination: &Path) -> Result<(), CloudError> {
    if remote_id.is_empty() {
        return Err(CloudError::RemoteMissing(
            "remote file ID is missing".into(),
        ));
    }
    let (_, token) = access_token().await?;
    let response = Client::new()
        .get(format!("{DRIVE_API}/files/{remote_id}"))
        .bearer_auth(token)
        .query(&[("alt", "media")])
        .send()
        .await
        .map_err(|e| CloudError::NetworkUnavailable(e.to_string()))?;
    if !response.status().is_success() {
        return Err(if response.status() == StatusCode::NOT_FOUND {
            CloudError::RemoteMissing("remote backup no longer exists".into())
        } else {
            api_error(response.status()).await
        });
    }
    let mut output =
        fs::File::create(destination).map_err(|e| CloudError::Download(e.to_string()))?;
    let mut stream = response.bytes_stream();
    use futures_util::StreamExt;
    while let Some(chunk) = stream.next().await {
        output
            .write_all(&chunk.map_err(|e| CloudError::Download(e.to_string()))?)
            .map_err(|e| CloudError::Download(e.to_string()))?;
    }
    output
        .sync_all()
        .map_err(|e| CloudError::Download(e.to_string()))?;
    Ok(())
}
pub async fn delete_remote(remote_id: &str) -> Result<(), String> {
    let (_, token) = access_token().await.map_err(|e| e.to_string())?;
    let response = Client::new()
        .delete(format!("{DRIVE_API}/files/{remote_id}"))
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| CloudError::NetworkUnavailable(e.to_string()).to_string())?;
    if !response.status().is_success() && response.status() != StatusCode::NOT_FOUND {
        return Err(api_error(response.status()).await.to_string());
    }
    Ok(())
}
pub async fn record_upload(
    path: &str,
    result: Result<RemoteBackup, CloudError>,
) -> Result<RemoteBackup, CloudError> {
    let mut state = load_state();
    match &result {
        Ok(_) => {
            state.pending.retain(|v| v != path);
            state.last_success = Some(now());
            state.last_error = None;
        }
        Err(error) => {
            if !state.pending.iter().any(|v| v == path) {
                state.pending.push(path.into());
            }
            state.last_error = Some(error.to_string());
        }
    }
    save_state(&state);
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    #[derive(Clone, Default)]
    struct MemoryOAuthCredentialStore {
        serialized: Arc<Mutex<Option<String>>>,
        fail_reads: bool,
    }

    impl OAuthCredentialStore for MemoryOAuthCredentialStore {
        fn read_oauth(&self) -> Result<OAuthStore, CloudError> {
            if self.fail_reads {
                return Err(CloudError::CredentialStoreUnavailable(
                    "test credential store unavailable".into(),
                ));
            }
            self.serialized
                .lock()
                .expect("test credential store lock")
                .as_deref()
                .ok_or_else(|| CloudError::NotConnected("no saved connection".into()))
                .and_then(|value| {
                    serde_json::from_str(value).map_err(|_| {
                        CloudError::Reconciliation("saved OAuth data is invalid".into())
                    })
                })
        }

        fn write_oauth(&self, store: &OAuthStore) -> Result<(), CloudError> {
            let serialized = serde_json::to_string(store)
                .map_err(|_| CloudError::Reconciliation("OAuth serialization failed".into()))?;
            *self.serialized.lock().expect("test credential store lock") = Some(serialized);
            Ok(())
        }
    }

    fn fake_oauth_store(expires_at: i64) -> OAuthStore {
        OAuthStore {
            access_token: "test-access-token".into(),
            refresh_token: "test-refresh-token".into(),
            expires_at,
            email: "owner@example.test".into(),
            folder_id: Some("test-folder-id".into()),
        }
    }

    #[test]
    fn pkce_uses_base64url_sha256() {
        assert_eq!(
            pkce_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn backup_id_parser_preserves_uuid_hyphens() {
        assert_eq!(
            backup_id_from_name(
                "ATE05-1700000000-123e4567-e89b-12d3-a456-426614174000.ate05backup"
            ),
            "123e4567-e89b-12d3-a456-426614174000"
        );
    }

    #[test]
    fn recovery_envelopes_never_appear_as_restorable_backups() {
        let mut props = std::collections::HashMap::new();
        props.insert(
            "ate05_object_type".to_string(),
            "recovery_envelope".to_string(),
        );
        assert!(!is_backup_artifact(
            "ATE05 Recovery.ate05backup",
            Some(&props)
        ));
        assert!(is_backup_artifact("ATE05-1-id.ate05backup", None));
        assert!(!is_backup_artifact("ATE05 Recovery Envelope.json", None));
    }

    #[test]
    fn cloud_errors_are_typed_and_do_not_include_tokens() {
        let error =
            CloudError::TokenRefresh("Google authorization has expired or been revoked".into());
        assert!(error.to_string().starts_with("token_refresh_failed:"));
        assert!(!error.to_string().contains("access_token"));
    }

    #[test]
    fn missing_drive_login_is_distinct_from_a_locked_os_credential_store() {
        assert!(matches!(
            credential_read_error(keyring::Error::NoEntry),
            CloudError::NotConnected(_)
        ));
        assert!(matches!(
            credential_read_error(keyring::Error::NoStorageAccess(Box::new(
                std::io::Error::other("locked")
            ))),
            CloudError::CredentialStoreUnavailable(_)
        ));
    }

    #[test]
    fn oauth_credentials_survive_a_simulated_process_store_reload() {
        let first_process = MemoryOAuthCredentialStore::default();
        first_process
            .write_oauth(&fake_oauth_store(10_000))
            .unwrap();
        let restarted_process = MemoryOAuthCredentialStore {
            serialized: first_process.serialized.clone(),
            fail_reads: false,
        };
        let loaded = restarted_process.read_oauth().unwrap();
        assert_eq!(loaded.email, "owner@example.test");
        assert_eq!(loaded.refresh_token, "test-refresh-token");
        assert_eq!(loaded.folder_id.as_deref(), Some("test-folder-id"));
    }

    #[test]
    fn saved_refresh_token_restores_connected_status_after_reload() {
        tauri::async_runtime::block_on(async {
            let first_process = MemoryOAuthCredentialStore::default();
            first_process
                .write_oauth(&fake_oauth_store(10_000))
                .unwrap();
            let restarted_process = MemoryOAuthCredentialStore {
                serialized: first_process.serialized.clone(),
                fail_reads: false,
            };
            let status = cloud_status_from(
                &restarted_process,
                CloudState::default(),
                1_000,
                |_| async { panic!("valid access token should not refresh") },
            )
            .await;
            assert!(status.connected);
            assert_eq!(status.status, "up_to_date");
        });
    }

    #[test]
    fn expired_access_token_refreshes_and_persists_rotated_credentials() {
        tauri::async_runtime::block_on(async {
            let credentials = MemoryOAuthCredentialStore::default();
            credentials.write_oauth(&fake_oauth_store(0)).unwrap();
            let (updated, access_token) = refresh_oauth_if_needed(
                &credentials,
                credentials.read_oauth().unwrap(),
                1_000,
                |_| async {
                    Ok(TokenResponse {
                        access_token: Some("new-test-access-token".into()),
                        refresh_token: Some("rotated-test-refresh-token".into()),
                        expires_in: Some(3_600),
                        error: None,
                    })
                },
            )
            .await
            .unwrap();
            let reloaded = MemoryOAuthCredentialStore {
                serialized: credentials.serialized.clone(),
                fail_reads: false,
            }
            .read_oauth()
            .unwrap();
            assert_eq!(access_token, "new-test-access-token");
            assert_eq!(updated.refresh_token, "rotated-test-refresh-token");
            assert_eq!(reloaded.access_token, "new-test-access-token");
            assert_eq!(reloaded.refresh_token, "rotated-test-refresh-token");
            assert_eq!(reloaded.expires_at, 4_600);
        });
    }

    #[test]
    fn temporary_refresh_network_failure_keeps_saved_credentials_and_connected_state() {
        tauri::async_runtime::block_on(async {
            let credentials = MemoryOAuthCredentialStore::default();
            credentials.write_oauth(&fake_oauth_store(0)).unwrap();
            let before = credentials.read_oauth().unwrap();
            let status = cloud_status_from(&credentials, CloudState::default(), 1_000, |_| async {
                Err(CloudError::NetworkUnavailable(
                    "temporary offline test".into(),
                ))
            })
            .await;
            let after = credentials.read_oauth().unwrap();
            assert!(status.connected);
            assert_eq!(status.status, "drive_unavailable");
            assert_eq!(after.access_token, before.access_token);
            assert_eq!(after.refresh_token, before.refresh_token);
        });
    }

    #[test]
    fn missing_credentials_and_credential_store_failure_have_distinct_statuses() {
        tauri::async_runtime::block_on(async {
            let missing = cloud_status_from(
                &MemoryOAuthCredentialStore::default(),
                CloudState::default(),
                1_000,
                |_| async { panic!("missing credentials should not refresh") },
            )
            .await;
            assert!(!missing.connected);
            assert_eq!(missing.status, "disconnected");

            let inaccessible = MemoryOAuthCredentialStore {
                serialized: Arc::default(),
                fail_reads: true,
            };
            let failed =
                cloud_status_from(&inaccessible, CloudState::default(), 1_000, |_| async {
                    panic!("unavailable store should not refresh")
                })
                .await;
            assert!(!failed.connected);
            assert_eq!(failed.status, "credential_store_unavailable");
        });
    }

    #[test]
    fn revoked_refresh_credentials_require_reconnect_without_deleting_them() {
        tauri::async_runtime::block_on(async {
            let credentials = MemoryOAuthCredentialStore::default();
            credentials.write_oauth(&fake_oauth_store(0)).unwrap();
            let status = cloud_status_from(&credentials, CloudState::default(), 1_000, |_| async {
                Err(CloudError::AuthorizationRequired(
                    "safe reconnect message".into(),
                ))
            })
            .await;
            assert!(!status.connected);
            assert_eq!(status.status, "authorization_required");
            assert_eq!(
                credentials.read_oauth().unwrap().refresh_token,
                "test-refresh-token"
            );
        });
        assert!(matches!(
            refresh_response_error(StatusCode::BAD_REQUEST, Some("invalid_grant")),
            CloudError::AuthorizationRequired(_)
        ));
        assert!(matches!(
            refresh_response_error(StatusCode::SERVICE_UNAVAILABLE, Some("server_error")),
            CloudError::NetworkUnavailable(_)
        ));
    }

    #[test]
    fn oauth_errors_never_include_token_or_provider_description_values() {
        let error = CloudError::CredentialStoreUnavailable("credential store unavailable".into());
        let rendered = error.to_string();
        assert!(!rendered.contains("test-access-token"));
        assert!(!rendered.contains("test-refresh-token"));
        assert!(!rendered.contains("client_secret"));
        assert!(!rendered.contains("authorization_code"));
    }

    #[test]
    fn failed_attempt_releases_guard_for_retry() {
        let first = OAuthAttemptGuard::acquire().expect("first attempt should start");
        assert!(OAuthAttemptGuard::acquire().is_err());
        drop(first);
        assert!(OAuthAttemptGuard::acquire().is_ok());
    }

    #[test]
    fn timeout_releases_attempt_resources() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let result =
            callback_with_timeout(listener, "timeout-state".into(), Duration::from_millis(5));
        assert!(
            matches!(result, Err(CloudError::CallbackFailure(message)) if message.contains("timed out"))
        );
        assert!(OAuthAttemptGuard::acquire().is_ok());
    }

    #[test]
    fn access_denied_is_terminal_and_a_new_attempt_can_start() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let task = std::thread::spawn(move || {
            callback_with_timeout(listener, "fresh-state".into(), Duration::from_secs(1))
        });
        std::thread::sleep(Duration::from_millis(20));
        let mut stream = std::net::TcpStream::connect(address).unwrap();
        stream
            .write_all(b"GET /callback?error=access_denied&state=fresh-state HTTP/1.1\r\nHost: localhost\r\n\r\n")
            .unwrap();
        let result = task.join().unwrap();
        assert!(matches!(result, Err(CloudError::AuthorizationCancelled(_))));
        assert!(OAuthAttemptGuard::acquire().is_ok());
    }

    #[test]
    fn successful_callback_returns_code_and_preserves_state_validation() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let task = std::thread::spawn(move || {
            callback_with_timeout(listener, "success-state".into(), Duration::from_secs(1))
        });
        std::thread::sleep(Duration::from_millis(20));
        let mut stream = std::net::TcpStream::connect(address).unwrap();
        stream
            .write_all(b"GET /callback?code=test-code&state=success-state HTTP/1.1\r\nHost: localhost\r\n\r\n")
            .unwrap();
        assert_eq!(task.join().unwrap().unwrap(), "test-code");
    }
}
