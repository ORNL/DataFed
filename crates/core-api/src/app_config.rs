use serde::Deserialize;

#[cfg(feature = "metrics")]
use crate::metrics::MetricsConfig;

// This is what the AppSettings.toml file is parsed into,
// any configuration that you would like to add can be added
// to one of these structs or imported and added as another field
// as long as they #[derive(Deserialize)]
#[derive(Deserialize)]
pub struct AppConfig {
    pub rust_log: String,
    pub api: ApiConfig,
    pub loki: Option<LokiConfig>,
    #[cfg(feature = "metrics")]
    pub metrics: MetricsConfig,
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
