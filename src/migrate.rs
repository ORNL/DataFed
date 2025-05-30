use datafed_core_api::AppConfig;
use datafed_database::{MigratorTrait, sea_orm::Database};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let app_config: AppConfig = toml::from_str(
        tokio::fs::read_to_string("AppSettings.toml")
            .await
            .expect("could not read environment file")
            .as_str(),
    )?;

    let db = Database::connect(format!(
        "postgres://{}:{}@{}:{}/kraken",
        app_config.database.username,
        app_config.database.password,
        app_config.database.url,
        app_config.database.port
    ))
    .await?;

    datafed_database::Migrator::fresh(&db).await?;

    Ok(())
}
