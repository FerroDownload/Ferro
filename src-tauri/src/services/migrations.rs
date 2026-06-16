use sqlx::SqlitePool;

// Ref: https://context7.com/launchbadge/sqlx/llms.txt
pub async fn run_migrations(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::migrate!("./migrations").run(pool).await?;
    Ok(())
}
