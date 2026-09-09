#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

fn main() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(
                    "sqlite:ate05.db",
                    vec![Migration {
                        version: 1,
                        description: "ate05_initial_schema",
                        sql: include_str!(
                            "../../../../packages/database/drizzle/0000_clumsy_human_torch.sql"
                        ),
                        kind: MigrationKind::Up,
                    }],
                )
                .build(),
        )
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            fs::create_dir_all(data_dir.join("backups"))?;
            fs::create_dir_all(data_dir.join("logs"))?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running ATE05 POS");
}
