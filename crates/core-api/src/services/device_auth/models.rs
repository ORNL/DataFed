use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Serialize, Deserialize, ToSchema)]
pub struct StartAuthInput {
    pub scope: String,
}

#[derive(Serialize, Deserialize, ToSchema)]
pub struct StartAuthOutput {
    pub code: String,
}

#[derive(Serialize, Deserialize, ToSchema)]
pub struct PollDeviceAuthInput {
    pub code: String,
}

#[derive(Serialize, Deserialize, ToSchema)]
pub struct TokenSet {
    pub access_token: String,
    pub refresh_token: Option<String>,
}

impl axum::response::IntoResponse for StartAuthOutput {
    fn into_response(self) -> axum::response::Response {
        axum::response::Json(self).into_response()
    }
}

impl axum::response::IntoResponse for TokenSet {
    fn into_response(self) -> axum::response::Response {
        axum::response::Json(self).into_response()
    }
}
