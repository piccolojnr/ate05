use futures_core::future::BoxFuture;
use sqlx::error::BoxDynError;
use sqlx::migrate::{Migration, MigrationSource, MigrationType, Migrator};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::ConnectOptions;
use std::{path::Path, time::Duration};

pub async fn connect(path: &Path) -> Result<sqlx::SqlitePool, sqlx::Error> {
    SqlitePoolOptions::new()
        .max_connections(1)
        .idle_timeout(None)
        .max_lifetime(None)
        .connect_with(
            SqliteConnectOptions::new()
                .filename(path)
                .busy_timeout(Duration::from_secs(5))
                .foreign_keys(true),
        )
        .await
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
}
