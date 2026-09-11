use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::sync::Mutex;
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionUser {
    pub id: String,
    pub business_id: String,
    pub name: String,
    pub role: String,
    pub permissions: Vec<String>,
}

#[derive(Debug, Default)]
pub struct AuthSession(pub Mutex<Option<SessionUser>>);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthUser {
    pub id: String,
    pub name: String,
    pub role: String,
    pub active: bool,
    pub has_pin: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthBootstrap {
    pub users: Vec<AuthUser>,
    pub requires_owner_pin: bool,
}

pub fn permissions(role: &str) -> Vec<String> {
    match role {
        "owner" | "manager" => vec![
            "pos",
            "orders",
            "tables",
            "menu",
            "inventory",
            "settings",
            "staff",
            "printers",
            "backup",
            "inventory_adjustment",
        ],
        "cashier" => vec!["pos", "orders", "tables"],
        "kitchen" => vec!["pos", "orders", "inventory"],
        "inventory" => vec!["inventory"],
        "waiter" => vec!["pos", "orders", "tables"],
        _ => vec![],
    }
    .into_iter()
    .map(str::to_string)
    .collect()
}

pub async fn pool(app: &tauri::AppHandle) -> Result<SqlitePool, String> {
    let instances = app.state::<tauri_plugin_sql::DbInstances>();
    let lock = instances.0.read().await;
    match lock.get("sqlite:ate05.db") {
        Some(tauri_plugin_sql::DbPool::Sqlite(pool)) => Ok(pool.clone()),
        _ => Err("database_unavailable: local database is unavailable".into()),
    }
}

pub fn require_permission(app: &tauri::AppHandle, permission: &str) -> Result<SessionUser, String> {
    let session = app.state::<AuthSession>();
    let current = session
        .0
        .lock()
        .map_err(|_| "auth: session unavailable".to_string())?;
    let user = current
        .clone()
        .ok_or_else(|| "auth: sign in required".to_string())?;
    if user.permissions.iter().any(|value| value == permission) {
        Ok(user)
    } else {
        Err("permission_denied: You do not have permission to perform this action.".into())
    }
}

fn hash_pin(pin: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(pin.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|_| "auth: PIN could not be secured".into())
}

fn valid_pin(pin: &str) -> bool {
    (4..=6).contains(&pin.len()) && pin.chars().all(|character| character.is_ascii_digit())
}

#[tauri::command]
pub async fn auth_bootstrap(app: tauri::AppHandle) -> Result<AuthBootstrap, String> {
    let database = pool(&app).await?;
    let timestamp = time_now();
    sqlx::query("INSERT OR IGNORE INTO businesses (id, name, active, created_at, updated_at) VALUES ($1, 'ATE05', 1, $2, $2)")
        .bind("00000000-0000-4000-8000-000000000001")
        .bind(&timestamp)
        .execute(&database)
        .await
        .map_err(|_| "database: business setup could not be completed".to_string())?;
    sqlx::query("INSERT OR IGNORE INTO users (id, business_id, name, role, active, created_at, updated_at) VALUES ($1, $2, 'ATE05 Owner', 'owner', 1, $3, $3)")
        .bind("00000000-0000-4000-8000-000000000002")
        .bind("00000000-0000-4000-8000-000000000001")
        .bind(timestamp)
        .execute(&database)
        .await
        .map_err(|_| "database: owner setup could not be completed".to_string())?;
    let rows = sqlx::query_as::<_, (String, String, String, i64, Option<String>)>(
        "SELECT id, name, role, active, pin_hash FROM users WHERE business_id = $1 ORDER BY active DESC, name",
    )
    .bind("00000000-0000-4000-8000-000000000001")
    .fetch_all(&database)
    .await
    .map_err(|_| "database: staff accounts could not be loaded".to_string())?;
    let requires_owner_pin = rows
        .iter()
        .any(|(_, _, role, active, pin)| role == "owner" && *active == 1 && pin.is_none());
    Ok(AuthBootstrap {
        users: rows
            .into_iter()
            .map(|(id, name, role, active, pin)| AuthUser {
                id,
                name,
                role,
                active: active == 1,
                has_pin: pin.is_some(),
            })
            .collect(),
        requires_owner_pin,
    })
}

#[tauri::command]
pub async fn setup_owner_pin(
    app: tauri::AppHandle,
    user_id: String,
    pin: String,
) -> Result<(), String> {
    if !valid_pin(&pin) {
        return Err("validation: PIN must be 4 to 6 digits.".into());
    }
    let database = pool(&app).await?;
    let hash = hash_pin(&pin)?;
    let result = sqlx::query("UPDATE users SET pin_hash = $1, updated_at = $2 WHERE id = $3 AND business_id = $4 AND role = 'owner' AND active = 1 AND pin_hash IS NULL")
        .bind(hash).bind(chrono_like_now()).bind(user_id).bind("00000000-0000-4000-8000-000000000001")
        .execute(&database).await.map_err(|_| "database: owner PIN could not be saved".to_string())?;
    if result.rows_affected() != 1 {
        return Err("auth: owner PIN setup is no longer available.".into());
    }
    Ok(())
}

#[tauri::command]
pub async fn authenticate_user(
    app: tauri::AppHandle,
    user_id: String,
    pin: String,
) -> Result<SessionUser, String> {
    let database = pool(&app).await?;
    let row = sqlx::query_as::<_, (String, String, String, i64, Option<String>)>(
        "SELECT id, name, role, active, pin_hash FROM users WHERE id = $1 AND business_id = $2",
    )
    .bind(user_id)
    .bind("00000000-0000-4000-8000-000000000001")
    .fetch_optional(&database)
    .await
    .map_err(|_| "database: sign-in is unavailable".to_string())?;
    let Some((id, name, role, active, Some(hash))) = row else {
        return Err("auth: Incorrect PIN.".into());
    };
    if active != 1 {
        return Err("auth: This account is inactive.".into());
    }
    let parsed = PasswordHash::new(&hash).map_err(|_| "auth: Incorrect PIN.".to_string())?;
    if Argon2::default()
        .verify_password(pin.as_bytes(), &parsed)
        .is_err()
    {
        return Err("auth: Incorrect PIN.".into());
    }
    let user = SessionUser {
        id,
        business_id: "00000000-0000-4000-8000-000000000001".into(),
        name,
        role: role.clone(),
        permissions: permissions(&role),
    };
    let session = app.state::<AuthSession>();
    *session
        .0
        .lock()
        .map_err(|_| "auth: session unavailable".to_string())? = Some(user.clone());
    Ok(user)
}

#[tauri::command]
pub fn current_session(app: tauri::AppHandle) -> Result<Option<SessionUser>, String> {
    Ok(app
        .state::<AuthSession>()
        .0
        .lock()
        .map_err(|_| "auth: session unavailable".to_string())?
        .clone())
}

#[tauri::command]
pub fn lock_session(app: tauri::AppHandle) -> Result<(), String> {
    *app.state::<AuthSession>()
        .0
        .lock()
        .map_err(|_| "auth: session unavailable".to_string())? = None;
    Ok(())
}

#[tauri::command]
pub async fn list_staff(app: tauri::AppHandle) -> Result<Vec<AuthUser>, String> {
    require_permission(&app, "staff")?;
    let database = pool(&app).await?;
    let rows = sqlx::query_as::<_, (String, String, String, i64, Option<String>)>(
        "SELECT id, name, role, active, pin_hash FROM users WHERE business_id = $1 ORDER BY active DESC, name",
    )
    .bind("00000000-0000-4000-8000-000000000001")
    .fetch_all(&database)
    .await
    .map_err(|_| "database: staff accounts could not be loaded".to_string())?;
    Ok(rows
        .into_iter()
        .map(|(id, name, role, active, pin)| AuthUser {
            id,
            name,
            role,
            active: active == 1,
            has_pin: pin.is_some(),
        })
        .collect())
}

#[tauri::command]
pub async fn create_staff(
    app: tauri::AppHandle,
    name: String,
    role: String,
    pin: String,
) -> Result<AuthUser, String> {
    require_permission(&app, "staff")?;
    if name.trim().is_empty() {
        return Err("validation: Staff name is required.".into());
    }
    if ![
        "owner",
        "manager",
        "cashier",
        "waiter",
        "kitchen",
        "inventory",
    ]
    .contains(&role.as_str())
    {
        return Err("validation: Choose a valid staff role.".into());
    }
    if !valid_pin(&pin) {
        return Err("validation: PIN must be 4 to 6 digits.".into());
    }
    let database = pool(&app).await?;
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO users (id, business_id, name, role, active, pin_hash, created_at, updated_at) VALUES ($1, $2, $3, $4, 1, $5, $6, $6)")
        .bind(&id)
        .bind("00000000-0000-4000-8000-000000000001")
        .bind(name.trim())
        .bind(&role)
        .bind(hash_pin(&pin)?)
        .bind(time_now())
        .execute(&database)
        .await
        .map_err(|_| "database: staff member could not be created.".to_string())?;
    Ok(AuthUser {
        id,
        name: name.trim().into(),
        role,
        active: true,
        has_pin: true,
    })
}

#[tauri::command]
pub async fn update_staff(
    app: tauri::AppHandle,
    user_id: String,
    name: String,
    role: String,
    active: bool,
    pin: Option<String>,
) -> Result<(), String> {
    let actor = require_permission(&app, "staff")?;
    if name.trim().is_empty() {
        return Err("validation: Staff name is required.".into());
    }
    if ![
        "owner",
        "manager",
        "cashier",
        "waiter",
        "kitchen",
        "inventory",
    ]
    .contains(&role.as_str())
    {
        return Err("validation: Choose a valid staff role.".into());
    }
    if let Some(value) = &pin {
        if !valid_pin(value) {
            return Err("validation: PIN must be 4 to 6 digits.".into());
        }
    }
    let database = pool(&app).await?;
    let existing = sqlx::query_as::<_, (String, i64)>(
        "SELECT role, active FROM users WHERE id = $1 AND business_id = $2",
    )
    .bind(&user_id)
    .bind("00000000-0000-4000-8000-000000000001")
    .fetch_optional(&database)
    .await
    .map_err(|_| "database: staff member could not be loaded.".to_string())?
    .ok_or_else(|| "not_found: Staff member not found.".to_string())?;
    if existing.0 == "owner" && (!active || role != "owner") {
        let admins: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE business_id = $1 AND active = 1 AND role IN ('owner', 'manager')")
            .bind("00000000-0000-4000-8000-000000000001")
            .fetch_one(&database)
            .await
            .map_err(|_| "database: staff account could not be updated.".to_string())?;
        if admins <= 1 {
            return Err("invalid_state: At least one active administrator is required.".into());
        }
    }
    if actor.id == user_id && !active {
        return Err("invalid_state: You cannot deactivate your signed-in account.".into());
    }
    let hash = pin.map(|value| hash_pin(&value)).transpose()?;
    sqlx::query("UPDATE users SET name = $1, role = $2, active = $3, pin_hash = COALESCE($4, pin_hash), updated_at = $5 WHERE id = $6 AND business_id = $7")
        .bind(name.trim())
        .bind(role)
        .bind(active)
        .bind(hash)
        .bind(time_now())
        .bind(user_id)
        .bind("00000000-0000-4000-8000-000000000001")
        .execute(&database)
        .await
        .map_err(|_| "database: staff member could not be updated.".to_string())?;
    Ok(())
}

fn chrono_like_now() -> String {
    time_now()
}
fn time_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    format!("{seconds}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pins_are_hashed_and_verify_without_exposing_plaintext() {
        let hash = hash_pin("2468").unwrap();
        assert_ne!(hash, "2468");
        let parsed = PasswordHash::new(&hash).unwrap();
        assert!(Argon2::default().verify_password(b"2468", &parsed).is_ok());
        assert!(Argon2::default().verify_password(b"0000", &parsed).is_err());
    }
}
