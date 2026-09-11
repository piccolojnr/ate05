use std::fs;
use std::path::PathBuf;
use tauri::Manager;

const FILE_NAME: &str = "device-session.json";

fn preferences_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_config_dir()
        .map_err(|error| format!("device preferences path unavailable: {error}"))?
        .join(FILE_NAME))
}

#[derive(serde::Deserialize, serde::Serialize)]
struct DeviceSession {
    remembered_staff_id: Option<String>,
}

fn read_preferences(app: &tauri::AppHandle) -> Result<DeviceSession, String> {
    match fs::read_to_string(preferences_path(app)?) {
        Ok(value) => {
            serde_json::from_str(&value).map_err(|_| "device preferences are invalid".into())
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(DeviceSession {
            remembered_staff_id: None,
        }),
        Err(error) => Err(format!("device preferences could not be read: {error}")),
    }
}

fn write_preferences(app: &tauri::AppHandle, preferences: &DeviceSession) -> Result<(), String> {
    let path = preferences_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("device preferences could not be prepared: {error}"))?;
    }
    let temporary = path.with_extension(format!("json.{}.tmp", std::process::id()));
    let content = serde_json::to_vec(preferences).map_err(|error| error.to_string())?;
    fs::write(&temporary, content)
        .map_err(|error| format!("device preferences could not be saved: {error}"))?;
    fs::rename(temporary, path)
        .map_err(|error| format!("device preferences could not be saved: {error}"))
}

#[tauri::command]
pub fn remembered_staff_id(app: tauri::AppHandle) -> Result<Option<String>, String> {
    Ok(read_preferences(&app)?.remembered_staff_id)
}

#[tauri::command]
pub fn remember_staff(app: tauri::AppHandle, staff_id: String) -> Result<(), String> {
    let staff_id = staff_id.trim();
    if staff_id.is_empty() {
        return Err("staff identity is required".into());
    }
    write_preferences(
        &app,
        &DeviceSession {
            remembered_staff_id: Some(staff_id.to_string()),
        },
    )
}

#[tauri::command]
pub fn forget_remembered_staff(app: tauri::AppHandle) -> Result<(), String> {
    write_preferences(
        &app,
        &DeviceSession {
            remembered_staff_id: None,
        },
    )
}
