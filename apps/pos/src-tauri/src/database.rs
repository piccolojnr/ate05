use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
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
