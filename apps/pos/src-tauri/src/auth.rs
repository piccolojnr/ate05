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
    pub setup_required: bool,
    pub business_name: String,
    pub setup_step: i64,
    pub setup_business_name: Option<String>,
    pub setup_owner_name: Option<String>,
    pub setup_starter_pack: Option<String>,
    pub setup_table_count: Option<i64>,
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

async fn metadata_value(database: &SqlitePool, key: &str) -> Option<String> {
    sqlx::query_scalar::<_, String>("SELECT value FROM app_metadata WHERE key = $1")
        .bind(key)
        .fetch_optional(database)
        .await
        .ok()
        .flatten()
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
    let business_name: String = sqlx::query_scalar("SELECT name FROM businesses WHERE id = $1")
        .bind("00000000-0000-4000-8000-000000000001")
        .fetch_one(&database)
        .await
        .map_err(|_| "database: business details could not be loaded".to_string())?;
    let setup_status: String =
        sqlx::query_scalar("SELECT value FROM app_metadata WHERE key = 'setup_status'")
            .fetch_one(&database)
            .await
            .unwrap_or_else(|_| "completed".into());
    let setup_step = metadata_value(&database, "setup_step")
        .await
        .and_then(|value| value.parse().ok())
        .unwrap_or(0);
    let setup_business_name = metadata_value(&database, "setup_business_name").await;
    let setup_owner_name = metadata_value(&database, "setup_owner_name").await;
    let setup_starter_pack = metadata_value(&database, "setup_starter_pack").await;
    let setup_table_count = metadata_value(&database, "setup_table_count")
        .await
        .and_then(|value| value.parse().ok());
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
        setup_required: setup_status != "completed",
        business_name,
        setup_step,
        setup_business_name,
        setup_owner_name,
        setup_starter_pack,
        setup_table_count,
    })
}

#[tauri::command]
pub async fn save_setup_progress(
    app: tauri::AppHandle,
    step: i64,
    business_name: String,
    owner_name: String,
    starter_pack: String,
    table_count: i64,
) -> Result<(), String> {
    if !(0..=3).contains(&step) || !(0..=100).contains(&table_count) {
        return Err("validation: setup progress is invalid.".into());
    }
    let database = pool(&app).await?;
    let mut transaction = database
        .begin()
        .await
        .map_err(|_| "database: setup progress could not start".to_string())?;
    for (key, value) in [
        ("setup_status", "in_progress".to_string()),
        ("setup_step", step.to_string()),
        ("setup_business_name", business_name.trim().to_string()),
        ("setup_owner_name", owner_name.trim().to_string()),
        ("setup_starter_pack", starter_pack),
        ("setup_table_count", table_count.to_string()),
    ] {
        sqlx::query("INSERT INTO app_metadata (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
            .bind(key).bind(value).execute(&mut *transaction).await
            .map_err(|_| "database: setup progress could not be saved".to_string())?;
    }
    transaction
        .commit()
        .await
        .map_err(|_| "database: setup progress could not be completed".to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn complete_first_run_setup(
    app: tauri::AppHandle,
    business_name: String,
    owner_user_id: String,
    owner_name: String,
    owner_pin: String,
    starter_pack: String,
    table_count: u32,
) -> Result<(), String> {
    if business_name.trim().is_empty() {
        return Err("validation: Restaurant name is required.".into());
    }
    if owner_name.trim().is_empty() {
        return Err("validation: Owner name is required.".into());
    }
    if !valid_pin(&owner_pin) {
        return Err("validation: PIN must be 4 to 6 digits.".into());
    }
    if table_count > 100 {
        return Err("validation: Choose between 0 and 100 tables.".into());
    }
    if !["empty", "ghanaian", "fast_food", "drinks_snacks"].contains(&starter_pack.as_str()) {
        return Err("validation: Choose a valid starter menu.".into());
    }
    let database = pool(&app).await?;
    let hash = hash_pin(&owner_pin)?;
    let business_id = "00000000-0000-4000-8000-000000000001";
    let timestamp = time_now();
    let mut transaction = database
        .begin()
        .await
        .map_err(|_| "database: setup could not start".to_string())?;
    let owner_exists: Option<String> = sqlx::query_scalar(
        "SELECT id FROM users WHERE id = $1 AND business_id = $2 AND role = 'owner' AND active = 1",
    )
    .bind(&owner_user_id)
    .bind(business_id)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|_| "database: owner account could not be loaded".to_string())?;
    if owner_exists.is_none() {
        return Err("validation: Owner account is no longer available.".into());
    }
    sqlx::query("UPDATE businesses SET name = $1, updated_at = $2 WHERE id = $3")
        .bind(business_name.trim())
        .bind(&timestamp)
        .bind(business_id)
        .execute(&mut *transaction)
        .await
        .map_err(|_| "database: restaurant details could not be saved".to_string())?;
    sqlx::query("UPDATE users SET name = $1, pin_hash = $2, updated_at = $3 WHERE id = $4 AND business_id = $5")
        .bind(owner_name.trim())
        .bind(hash)
        .bind(&timestamp)
        .bind(&owner_user_id)
        .bind(business_id)
        .execute(&mut *transaction)
        .await
        .map_err(|_| "database: owner account could not be saved".to_string())?;

    let packs: &[(&str, &str, &[(&str, i64)])] = match starter_pack.as_str() {
        "ghanaian" => &[
            (
                "Main Meals",
                "main-meals",
                &[("Fried Rice", 5000), ("Jollof Rice", 5000)],
            ),
            (
                "Local Dishes",
                "local-dishes",
                &[("Waakye", 4500), ("Banku with Tilapia", 6500)],
            ),
            ("Drinks", "drinks", &[("Bottled Water", 500)]),
        ],
        "fast_food" => &[
            (
                "Meals",
                "meals",
                &[("Chicken Burger", 4500), ("Chicken Wings", 3500)],
            ),
            (
                "Drinks",
                "drinks",
                &[("Coke", 1200), ("Bottled Water", 500)],
            ),
        ],
        "drinks_snacks" => &[
            (
                "Drinks",
                "drinks",
                &[("Coke", 1200), ("Bottled Water", 500)],
            ),
            ("Snacks", "snacks", &[("Meat Pie", 1500), ("Chips", 2000)]),
        ],
        _ => &[],
    };
    for (category_name, category_key, items) in packs {
        let category_id = format!("setup-category-{category_key}");
        sqlx::query("INSERT OR IGNORE INTO menu_categories (id, business_id, name, sort_order, active, created_at, updated_at) VALUES ($1, $2, $3, 0, 1, $4, $4)")
            .bind(&category_id).bind(business_id).bind(category_name).bind(&timestamp)
            .execute(&mut *transaction).await
            .map_err(|_| "database: starter menu could not be saved".to_string())?;
        for (item_name, price) in *items {
            let item_id = format!(
                "setup-item-{}-{}",
                category_key,
                item_name.to_lowercase().replace(' ', "-")
            );
            sqlx::query("INSERT OR IGNORE INTO menu_items (id, business_id, category_id, name, description, selling_price_minor, available, active, created_at, updated_at) VALUES ($1, $2, $3, $4, NULL, $5, 1, 1, $6, $6)")
                .bind(item_id).bind(business_id).bind(&category_id).bind(item_name).bind(price).bind(&timestamp)
                .execute(&mut *transaction).await
                .map_err(|_| "database: starter menu could not be saved".to_string())?;
        }
    }
    for number in 1..=table_count {
        let name = format!("Table {number}");
        let id = format!("setup-table-{number}");
        sqlx::query("INSERT OR IGNORE INTO restaurant_tables (id, business_id, name, capacity, status, active, created_at, updated_at) VALUES ($1, $2, $3, 4, 'available', 1, $4, $4)")
            .bind(id).bind(business_id).bind(name).bind(&timestamp)
            .execute(&mut *transaction).await
            .map_err(|_| "database: tables could not be saved".to_string())?;
    }
    sqlx::query("INSERT INTO app_metadata (key, value) VALUES ('setup_status', 'completed') ON CONFLICT(key) DO UPDATE SET value = 'completed'")
        .execute(&mut *transaction).await
        .map_err(|_| "database: setup status could not be saved".to_string())?;
    transaction
        .commit()
        .await
        .map_err(|_| "database: setup could not be completed".to_string())?;
    Ok(())
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
