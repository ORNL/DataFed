use axum::{Json, extract::State};
use reqwest::StatusCode;
use serde::Deserialize;
use utoipa::path as route;
use utoipa_axum::{router::OpenApiRouter, routes};

use crate::{
    ApiError, ApiState, OIDC,
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
    State(oidc): State<OIDC>,
    Json(start_auth_input): Json<StartAuthInput>,
) -> Result<StartAuthOutput, ApiError> {
    #[derive(Deserialize)]
    struct DeviceAuthResponse {
        verification_uri: Option<String>,
        verification_uri_complete: Option<String>,
        user_code: Option<String>,
        device_code: Option<String>,
    }

    if oidc.device_authorization_endpoint.is_empty() || oidc.client_id.is_empty() {
        return Err(ApiError::SetupError);
    }

    let scope = start_auth_input.scope;

    let response = reqwest::Client::new()
        .post(&oidc.device_authorization_endpoint)
        .form(&[("client_id", oidc.client_id), ("scope", scope)])
        .send()
        .await
        .map_err(|_| ApiError::InternalServerError)?;

    if !response.status().is_success() {
        return Err(ApiError::BadRequest);
    }

    let payload = response
        .json::<DeviceAuthResponse>()
        .await
        .map_err(|_| ApiError::InternalServerError)?;

    let verification_uri = payload
        .verification_uri_complete
        .or(payload.verification_uri)
        .ok_or(ApiError::InternalServerError)?;

    let code = payload
        .user_code
        .or(payload.device_code)
        .ok_or(ApiError::InternalServerError)?;

    Ok(StartAuthOutput {
        verification_uri,
        code,
    })
}

#[route(post, path = "/auth/device/poll", responses((status = OK, body = TokenSet), (status = BAD_REQUEST), (status = UNAUTHORIZED), (status = TOO_MANY_REQUESTS)))]
async fn poll_device_auth(
    State(oidc): State<OIDC>,
    Json(poll_device_auth_input): Json<PollDeviceAuthInput>,
) -> Result<TokenSet, ApiError> {
    #[derive(Deserialize)]
    struct TokenResponse {
        access_token: Option<String>,
        refresh_token: Option<String>,
    }

    if oidc.token_endpoint.is_empty() || oidc.client_id.is_empty() {
        return Err(ApiError::SetupError);
    }

    if poll_device_auth_input.code.is_empty() {
        return Err(ApiError::BadRequest);
    }

    const GRANT_TYPE: &str = "urn:ietf:params:oauth:grant-type:device_code";

    let response = reqwest::Client::new()
        .post(&oidc.token_endpoint)
        .form(&[
            ("client_id", oidc.client_id.as_str()),
            ("device_code", poll_device_auth_input.code.as_str()),
            ("grant_type", GRANT_TYPE),
        ])
        .send()
        .await
        .map_err(|_| ApiError::InternalServerError)?;

    let status = response.status();

    if status.is_success() {
        let tokens = response
            .json::<TokenResponse>()
            .await
            .map_err(|_| ApiError::InternalServerError)?;

        let access_token = tokens.access_token.ok_or(ApiError::InternalServerError)?;

        return Ok(TokenSet {
            access_token,
            refresh_token: tokens.refresh_token,
        });
    }

    match status {
        StatusCode::BAD_REQUEST => Err(ApiError::BadRequest),
        StatusCode::UNAUTHORIZED => Err(ApiError::Unauthorized),
        StatusCode::TOO_MANY_REQUESTS => Err(ApiError::TooManyRequests),
        _ => Err(ApiError::InternalServerError),
    }
}
