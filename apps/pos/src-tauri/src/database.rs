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
                Migration::new(
                    5,
                    "first_run_setup_state".into(),
                    MigrationType::ReversibleUp,
                    include_str!("../../../../packages/database/drizzle/0004_setup_state.sql")
                        .into(),
                    false,
                ),
                Migration::new(
                    6,
                    "menu_price_options".into(),
                    MigrationType::ReversibleUp,
                    include_str!(
                        "../../../../packages/database/drizzle/0005_menu_price_options.sql"
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

    #[derive(Debug)]
    struct PreviousMigrations(Vec<Migration>);

    impl MigrationSource<'static> for PreviousMigrations {
        fn resolve(self) -> BoxFuture<'static, Result<Vec<Migration>, BoxDynError>> {
            Box::pin(async move { Ok(self.0) })
        }
    }

    async fn temp_database_path(label: &str) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!(
            "ate05-{label}-{}-{}.db",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let _ = std::fs::remove_file(&path);
        std::fs::File::create(&path).unwrap();
        path
    }

    async fn migrate_to_previous_schema(path: &Path) -> sqlx::SqlitePool {
        let pool = connect(path).await.unwrap();
        let migrations = Ate05Migrations.resolve().await.unwrap();
        let previous = Migrator::new(PreviousMigrations(migrations.into_iter().take(5).collect()))
            .await
            .unwrap();
        pool.close().await;
        let mut connection = SqliteConnectOptions::new()
            .filename(path)
            .foreign_keys(true)
            .connect()
            .await
            .unwrap();
        previous.run_direct(&mut connection).await.unwrap();
        connection.close().await.unwrap();
        connect(path).await.unwrap()
    }

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

    #[test]
    fn migrates_populated_previous_production_schema_without_losing_data() {
        tauri::async_runtime::block_on(async {
            let path = temp_database_path("migration-populated").await;
            let pool = migrate_to_previous_schema(&path).await;
            let timestamp = "2026-09-21T12:00:00Z";
            sqlx::query("INSERT INTO businesses (id, name, active, created_at, updated_at) VALUES (?, ?, 1, ?, ?)")
                .bind("migration-business").bind("Migration Cafe").bind(timestamp).bind(timestamp).execute(&pool).await.unwrap();
            sqlx::query("INSERT INTO users (id, business_id, name, role, active, created_at, updated_at) VALUES (?, ?, ?, 'owner', 1, ?, ?)")
                .bind("migration-owner").bind("migration-business").bind("Owner").bind(timestamp).bind(timestamp).execute(&pool).await.unwrap();
            sqlx::query("INSERT INTO menu_categories (id, business_id, name, sort_order, active, created_at, updated_at) VALUES (?, ?, ?, 0, 1, ?, ?)")
                .bind("migration-category").bind("migration-business").bind("Mains").bind(timestamp).bind(timestamp).execute(&pool).await.unwrap();
            sqlx::query("INSERT INTO menu_items (id, business_id, category_id, name, selling_price_minor, available, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?)")
                .bind("migration-item").bind("migration-business").bind("migration-category").bind("Tilapia").bind(11000_i64).bind(timestamp).bind(timestamp).execute(&pool).await.unwrap();
            sqlx::query("INSERT INTO orders (id, business_id, order_number, order_type, created_by, status, payment_status, subtotal_minor, discount_minor, total_minor, opened_at, created_at, updated_at) VALUES (?, ?, 7, 'takeaway', ?, 'completed', 'paid', 11000, 0, 11000, ?, ?, ?)")
                .bind("migration-order").bind("migration-business").bind("migration-owner").bind(timestamp).bind(timestamp).bind(timestamp).execute(&pool).await.unwrap();
            sqlx::query("INSERT INTO order_items (id, business_id, order_id, menu_item_id, item_name_snapshot, unit_price_minor_snapshot, quantity, line_total_minor, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 11000, 1, 11000, ?, ?)")
                .bind("migration-line").bind("migration-business").bind("migration-order").bind("migration-item").bind("Tilapia").bind(timestamp).bind(timestamp).execute(&pool).await.unwrap();
            sqlx::query("INSERT INTO payments (id, business_id, order_id, amount_minor, method, status, reference, received_by, received_at, created_at, updated_at) VALUES (?, ?, ?, 11000, 'cash', 'recorded', ?, ?, ?, ?, ?)")
                .bind("migration-payment").bind("migration-business").bind("migration-order").bind("cash-ref").bind("migration-owner").bind(timestamp).bind(timestamp).bind(timestamp).execute(&pool).await.unwrap();
            sqlx::query("INSERT INTO receipts (id, business_id, order_id, receipt_number, total_minor, payment_summary, snapshot, print_status, print_attempt_count, issued_at, issued_by, created_at) VALUES (?, ?, ?, 7, 11000, ?, ?, 'printed', 1, ?, ?, ?)")
                .bind("migration-receipt").bind("migration-business").bind("migration-order").bind("Cash GHS 110.00").bind(r#"{"items":[{"name":"Tilapia","unitPriceMinor":11000}]}"#).bind(timestamp).bind("migration-owner").bind(timestamp).execute(&pool).await.unwrap();
            sqlx::query("INSERT INTO printers (id, business_id, name, role, connection_type, address, port, paper_width, cutter_enabled, active, created_at, updated_at) VALUES (?, ?, ?, 'receipt', 'network', '127.0.0.1', 9100, 80, 1, 1, ?, ?)")
                .bind("migration-printer").bind("migration-business").bind("Receipt").bind(timestamp).bind(timestamp).execute(&pool).await.unwrap();
            sqlx::query("INSERT INTO kitchen_tickets (id, business_id, order_id, sequence, type, created_by, print_status, printed_at, print_attempt_count, created_at, updated_at) VALUES (?, ?, ?, 1, 'initial', ?, 'printed', ?, 1, ?, ?)")
                .bind("migration-ticket").bind("migration-business").bind("migration-order").bind("migration-owner").bind(timestamp).bind(timestamp).bind(timestamp).execute(&pool).await.unwrap();
            sqlx::query("INSERT INTO kitchen_ticket_items (id, business_id, kitchen_ticket_id, order_item_id, item_name_snapshot, quantity, action, created_at) VALUES (?, ?, ?, ?, ?, 1, 'add', ?)")
                .bind("migration-ticket-line").bind("migration-business").bind("migration-ticket").bind("migration-line").bind("Tilapia").bind(timestamp).execute(&pool).await.unwrap();
            sqlx::query("INSERT INTO print_attempts (id, business_id, document_type, document_id, printer_id, context, attempted_at, success) VALUES (?, ?, 'receipt', ?, ?, 'initial', ?, 1)")
                .bind("migration-print-attempt").bind("migration-business").bind("migration-receipt").bind("migration-printer").bind(timestamp).execute(&pool).await.unwrap();

            let counts_before = sqlx::query_as::<_, (i64, i64, i64, i64, i64, i64, i64)>(
                "SELECT (SELECT COUNT(*) FROM menu_items), (SELECT COUNT(*) FROM orders), (SELECT COUNT(*) FROM order_items), (SELECT COUNT(*) FROM payments), (SELECT COUNT(*) FROM receipts), (SELECT COUNT(*) FROM kitchen_ticket_items), (SELECT COUNT(*) FROM print_attempts)",
            ).fetch_one(&pool).await.unwrap();
            let old_receipt_snapshot: String =
                sqlx::query_scalar("SELECT snapshot FROM receipts WHERE id = 'migration-receipt'")
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            pool.close().await;

            migrate_path(&path).await.unwrap();
            let migrated = connect(&path).await.unwrap();
            let version: i64 = sqlx::query_scalar("SELECT MAX(version) FROM _sqlx_migrations")
                .fetch_one(&migrated)
                .await
                .unwrap();
            assert_eq!(version, 6);
            assert_eq!(
                sqlx::query_scalar::<_, String>(
                    "SELECT pricing_mode FROM menu_items WHERE id = 'migration-item'"
                )
                .fetch_one(&migrated)
                .await
                .unwrap(),
                "fixed"
            );
            assert_eq!(
                sqlx::query_scalar::<_, i64>(
                    "SELECT selling_price_minor FROM menu_items WHERE id = 'migration-item'"
                )
                .fetch_one(&migrated)
                .await
                .unwrap(),
                11000
            );
            assert_eq!(
                sqlx::query_scalar::<_, i64>(
                    "SELECT unit_price_minor_snapshot FROM order_items WHERE id = 'migration-line'"
                )
                .fetch_one(&migrated)
                .await
                .unwrap(),
                11000
            );
            assert!(sqlx::query_scalar::<_, Option<String>>(
                "SELECT price_option_id FROM order_items WHERE id = 'migration-line'"
            )
            .fetch_one(&migrated)
            .await
            .unwrap()
            .is_none());
            assert!(sqlx::query_scalar::<_, Option<String>>(
                "SELECT price_option_name_snapshot FROM order_items WHERE id = 'migration-line'"
            )
            .fetch_one(&migrated)
            .await
            .unwrap()
            .is_none());
            assert_eq!(
                sqlx::query_scalar::<_, String>(
                    "SELECT snapshot FROM receipts WHERE id = 'migration-receipt'"
                )
                .fetch_one(&migrated)
                .await
                .unwrap(),
                old_receipt_snapshot
            );
            assert_eq!(sqlx::query_as::<_, (i64, i64, i64, i64, i64, i64, i64)>("SELECT (SELECT COUNT(*) FROM menu_items), (SELECT COUNT(*) FROM orders), (SELECT COUNT(*) FROM order_items), (SELECT COUNT(*) FROM payments), (SELECT COUNT(*) FROM receipts), (SELECT COUNT(*) FROM kitchen_ticket_items), (SELECT COUNT(*) FROM print_attempts)").fetch_one(&migrated).await.unwrap(), counts_before);
            assert_eq!(
                sqlx::query_scalar::<_, String>("PRAGMA integrity_check")
                    .fetch_one(&migrated)
                    .await
                    .unwrap(),
                "ok"
            );
            assert!(sqlx::query("PRAGMA foreign_key_check")
                .fetch_all(&migrated)
                .await
                .unwrap()
                .is_empty());
            assert_eq!(
                sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM menu_item_price_options")
                    .fetch_one(&migrated)
                    .await
                    .unwrap(),
                0
            );
            migrated.close().await;
            let _ = std::fs::remove_file(&path);
            let _ = std::fs::remove_file(path.with_extension("db-wal"));
            let _ = std::fs::remove_file(path.with_extension("db-shm"));
        });
    }

    #[test]
    fn failed_pricing_migration_rolls_back_schema_and_bookkeeping() {
        tauri::async_runtime::block_on(async {
            let path = temp_database_path("migration-rollback").await;
            let pool = migrate_to_previous_schema(&path).await;
            sqlx::query("CREATE TABLE menu_item_price_options (id TEXT PRIMARY KEY)")
                .execute(&pool)
                .await
                .unwrap();
            pool.close().await;
            assert!(migrate_path(&path).await.is_err());
            let check = connect(&path).await.unwrap();
            let columns: Vec<String> = sqlx::query_scalar(
                "SELECT name FROM pragma_table_info('menu_items') WHERE name = 'pricing_mode'",
            )
            .fetch_all(&check)
            .await
            .unwrap();
            assert!(columns.is_empty());
            assert_eq!(
                sqlx::query_scalar::<_, i64>("SELECT MAX(version) FROM _sqlx_migrations")
                    .fetch_one(&check)
                    .await
                    .unwrap(),
                5
            );
            check.close().await;
            let _ = std::fs::remove_file(&path);
            let _ = std::fs::remove_file(path.with_extension("db-wal"));
            let _ = std::fs::remove_file(path.with_extension("db-shm"));
        });
    }
}
