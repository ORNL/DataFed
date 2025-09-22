use reqwest::get;
use serde_json::Value;

use crate::OIDCConfig;

#[derive(Clone)]
pub struct OIDC {
    pub device_authorization_endpoint: String,
    pub token_endpoint: String,
    pub client_id: String,
}

impl OIDC {
    pub async fn new(oidc_config: OIDCConfig) -> Result<Self, reqwest::Error> {
        let res = get(oidc_config.discovery_url).await?;
        let config: Value = res.json().await?;

        let device_authorization_endpoint = config
            .get("device_authorization_endpoint")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();

        let token_endpoint = config
            .get("token_endpoint")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();

        Ok(Self {
            device_authorization_endpoint,
            token_endpoint,
            client_id: oidc_config.client_id,
        })
    }
}

#[derive(Clone)]
pub struct ApiState {
    pub oidc: OIDC,
}

#[allow(unused)]
macro_rules! from_state {
    ($t:ty, $i:ident) => {
        impl axum::extract::FromRef<ApiState> for $t {
            fn from_ref(app_state: &ApiState) -> $t {
                app_state.$i.clone()
            }
        }
    };
}

from_state!(OIDC, oidc);
