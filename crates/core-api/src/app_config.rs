use datafed_database::DatabaseConfig;
use serde::Deserialize;

#[derive(Deserialize)]
pub struct AppConfig {
    pub rust_log: String,
    pub api: ApiConfig,
    pub database: DatabaseConfig,
    pub loki: Option<LokiConfig>,
}

#[derive(Deserialize)]
pub struct ApiConfig {
    pub url: String,
    pub port: u16,
}

#[derive(Deserialize)]
pub struct LokiConfig {
    pub url: String,
    pub service_name: String,
}
