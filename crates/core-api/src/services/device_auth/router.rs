use axum::Json;
use utoipa::path as route;
use utoipa_axum::{router::OpenApiRouter, routes};

use crate::{
    ApiError, ApiState,
    services::device_auth::{PollDeviceAuthInput, StartAuthInput, StartAuthOutput, TokenSet},
};

pub fn router() -> OpenApiRouter<ApiState> {
    // this needs to be two separate .routes() because they are both post routes,
    // which does not work with the routes!() macro for whatever reason
    OpenApiRouter::new()
        .routes(routes!(start_device_auth))
        .routes(routes!(poll_device_auth))
}

#[route(post, path = "/auth/device", responses((status = OK, body = StartAuthOutput), (status = BAD_REQUEST), (status = UNAUTHORIZED)))]
async fn start_device_auth(
    Json(_start_auth_input): Json<StartAuthInput>,
) -> Result<StartAuthOutput, ApiError> {
    Ok(StartAuthOutput { code: "".into() })
}

#[route(post, path = "/auth/device/poll", responses((status = OK, body = TokenSet), (status = BAD_REQUEST), (status = UNAUTHORIZED), (status = TOO_MANY_REQUESTS)))]
async fn poll_device_auth(
    Json(_poll_device_auth_input): Json<PollDeviceAuthInput>,
) -> Result<TokenSet, ApiError> {
    Ok(TokenSet {
        access_token: "".into(),
        refresh_token: None,
    })
}
