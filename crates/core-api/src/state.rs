use jsonwebtoken::jwk::JwkSet;
use reqwest::get;
use serde_json::Value;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::OIDCConfig;

#[derive(Clone)]
pub struct OIDC {
    pub device_authorization_endpoint: String,
    pub token_endpoint: String,
    pub client_id: String,
    pub issuer: String,
    pub jwks_uri: String,
    jwks_cache: Arc<RwLock<Option<JwkSet>>>,
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

        let issuer = config
            .get("issuer")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();

        let jwks_uri = config
            .get("jwks_uri")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| {
                if issuer.is_empty() {
                    String::new()
                } else {
                    let mut base = issuer.trim_end_matches('/').to_string();
                    base.push_str("/.well-known/jwks.json");
                    base
                }
            });

        Ok(Self {
            device_authorization_endpoint,
            token_endpoint,
            client_id: oidc_config.client_id,
            issuer,
            jwks_uri,
            jwks_cache: Arc::new(RwLock::new(None)),
        })
    }

    pub async fn cached_jwks(&self) -> Option<JwkSet> {
        self.jwks_cache.read().await.clone()
    }

    pub async fn store_jwks(&self, jwks: JwkSet) {
        *self.jwks_cache.write().await = Some(jwks);
    }

    pub async fn clear_jwks(&self) {
        *self.jwks_cache.write().await = None;
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
