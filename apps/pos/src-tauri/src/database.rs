use futures_core::future::BoxFuture;
use sqlx::error::BoxDynError;
use sqlx::migrate::{Migration, MigrationSource, MigrationType, Migrator};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::ConnectOptions;
use std::{path::Path, time::Duration};

pub async fn connect(path: &Path) -> Result<sqlx::SqlitePool, sqlx::Error> {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .idle_timeout(None)
        .max_lifetime(None)
        .connect_with(
            SqliteConnectOptions::new()
                .filename(path)
                .busy_timeout(Duration::from_secs(5))
                .foreign_keys(true),
        )
        .await?;
    sqlx::query("PRAGMA journal_mode = WAL")
        .execute(&pool)
        .await?;
    sqlx::query("PRAGMA synchronous = NORMAL")
        .execute(&pool)
        .await?;
    sqlx::query("PRAGMA foreign_keys = ON")
        .execute(&pool)
        .await?;
    Ok(pool)
}

#[derive(Debug)]
struct Ate05Migrations;

impl MigrationSource<'static> for Ate05Migrations {
    fn resolve(self) -> BoxFuture<'static, Result<Vec<Migration>, BoxDynError>> {
        Box::pin(async {
            Ok(vec![
                Migration::new(
                    1,
                    "ate05_initial_schema".into(),
                    MigrationType::ReversibleUp,
                    include_str!(
                        "../../../../packages/database/drizzle/0000_clumsy_human_torch.sql"
                    )
                    .into(),
                    false,
                ),
                Migration::new(
                    2,
                    "ate05_printers_and_print_attempts".into(),
                    MigrationType::ReversibleUp,
                    include_str!("../../../../packages/database/drizzle/0001_chilly_harpoon.sql")
                        .into(),
                    false,
                ),
                Migration::new(
                    3,
                    "payment_receipt_v1".into(),
                    MigrationType::ReversibleUp,
                    include_str!(
                        "../../../../packages/database/drizzle/0002_lovely_ghost_rider.sql"
                    )
                    .into(),
                    false,
                ),
                Migration::new(
                    4,
                    "print_attempts_v1".into(),
                    MigrationType::ReversibleUp,
                    include_str!("../../../../packages/database/drizzle/0003_classy_thundra.sql")
                        .into(),
                    false,
                ),
            ])
        })
    }
}

pub async fn migrate_path(path: &Path) -> Result<(), String> {
    let migrator = Migrator::new(Ate05Migrations)
        .await
        .map_err(|error| error.to_string())?;
    let mut connection = SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(false)
        .busy_timeout(Duration::from_secs(5))
        .foreign_keys(true)
        .connect()
        .await
        .map_err(|error| error.to_string())?;
    migrator
        .run_direct(&mut connection)
        .await
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn separate_plugin_style_calls_share_transaction_and_rollback() {
        tauri::async_runtime::block_on(async {
            let pool = connect(Path::new(":memory:")).await.unwrap();
            sqlx::query("CREATE TABLE orders (id INTEGER PRIMARY KEY)")
                .execute(&pool)
                .await
                .unwrap();
            for id in 1..=3 {
                sqlx::query("BEGIN IMMEDIATE").execute(&pool).await.unwrap();
                sqlx::query("INSERT INTO orders VALUES (?)")
                    .bind(id)
                    .execute(&pool)
                    .await
                    .unwrap();
                let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM orders")
                    .fetch_one(&pool)
                    .await
                    .unwrap();
                assert_eq!(count, id);
                sqlx::query("COMMIT").execute(&pool).await.unwrap();
            }
            sqlx::query("BEGIN IMMEDIATE").execute(&pool).await.unwrap();
            sqlx::query("INSERT INTO orders VALUES (4)")
                .execute(&pool)
                .await
                .unwrap();
            assert!(sqlx::query("INSERT INTO orders VALUES (4)")
                .execute(&pool)
                .await
                .is_err());
            sqlx::query("ROLLBACK").execute(&pool).await.unwrap();
            let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM orders")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(count, 3);
            pool.close().await;
        });
    }

    #[test]
    fn production_connection_enables_foreign_keys_and_durability_pragmas() {
        tauri::async_runtime::block_on(async {
            let path = std::env::temp_dir().join(format!(
                "ate05-pragmas-{}-{}.db",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
            std::fs::File::create(&path).unwrap();
            let pool = connect(&path).await.unwrap();
            let foreign_keys: i64 = sqlx::query_scalar("PRAGMA foreign_keys")
                .fetch_one(&pool)
                .await
                .unwrap();
            let journal_mode: String = sqlx::query_scalar("PRAGMA journal_mode")
                .fetch_one(&pool)
                .await
                .unwrap();
            let synchronous: i64 = sqlx::query_scalar("PRAGMA synchronous")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(foreign_keys, 1);
            assert_eq!(journal_mode.to_lowercase(), "wal");
            assert_eq!(synchronous, 1);
            pool.close().await;
            let _ = std::fs::remove_file(&path);
            let _ = std::fs::remove_file(path.with_extension("db-wal"));
            let _ = std::fs::remove_file(path.with_extension("db-shm"));
        });
    }
}
