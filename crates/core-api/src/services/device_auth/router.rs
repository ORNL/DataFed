use axum::{Json, extract::State};
use jsonwebtoken::{
    Algorithm, DecodingKey, Validation, decode, decode_header,
    errors::ErrorKind,
    jwk::{AlgorithmParameters, JwkSet, KeyAlgorithm},
};
use reqwest::StatusCode;
use serde::Deserialize;
use utoipa::path as route;
use utoipa_axum::{router::OpenApiRouter, routes};

use crate::{
    ApiError, ApiState, OIDC,
    services::device_auth::{
        LegacyValidateInput, PollDeviceAuthInput, StartAuthInput, StartAuthOutput, TokenSet,
    },
};

pub fn router() -> OpenApiRouter<ApiState> {
    // this needs to be two separate .routes() because they are both post routes,
    // which does not work with the routes!() macro for whatever reason
    OpenApiRouter::new()
        .routes(routes!(start_device_auth))
        .routes(routes!(poll_device_auth))
        .routes(routes!(legacy_validate))
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

#[route(post, path = "/auth/legacy/validate", responses((status = OK, body = ()), (status = BAD_REQUEST), (status = UNAUTHORIZED)))]
async fn legacy_validate(
    State(oidc): State<OIDC>,
    Json(legacy_validate_input): Json<LegacyValidateInput>,
) -> Result<TokenSet, ApiError> {
    if oidc.jwks_uri.is_empty() {
        return Err(ApiError::SetupError);
    }

    let token = legacy_validate_input.token.trim();
    if token.is_empty() {
        return Err(ApiError::BadRequest);
    }

    let token = token.to_owned();
    let header = decode_header(&token).map_err(|_| ApiError::Unauthorized)?;
    let client = reqwest::Client::new();
    let mut jwks = load_jwks(&oidc, &client, false).await?;

    for attempt in 0..=1 {
        match validate_with_jwks(&token, &header, &jwks, oidc.issuer.as_str()) {
            Ok(_) => {
                return Ok(TokenSet {
                    access_token: token.clone(),
                    refresh_token: None,
                });
            }
            Err(TokenValidationFailure::NoMatchingKey) => {
                if attempt == 0 {
                    jwks = load_jwks(&oidc, &client, true).await?;
                    continue;
                }

                return Err(ApiError::Unauthorized);
            }
            Err(TokenValidationFailure::Jwt(kind)) => {
                let retry = attempt == 0 && should_refresh(&kind);
                let error = map_error_kind(&kind);

                if retry {
                    jwks = load_jwks(&oidc, &client, true).await?;
                    continue;
                }

                return Err(error);
            }
        }
    }

    Err(ApiError::Unauthorized)
}

#[derive(Debug)]
enum TokenValidationFailure {
    NoMatchingKey,
    Jwt(ErrorKind),
}

async fn load_jwks(
    oidc: &OIDC,
    client: &reqwest::Client,
    force_refresh: bool,
) -> Result<JwkSet, ApiError> {
    if !force_refresh {
        if let Some(cached) = oidc.cached_jwks().await {
            return Ok(cached);
        }
    } else {
        oidc.clear_jwks().await;
    }

    let response = client
        .get(&oidc.jwks_uri)
        .send()
        .await
        .map_err(|_| ApiError::InternalServerError)?;

    if !response.status().is_success() {
        return Err(ApiError::InternalServerError);
    }

    let jwks = response
        .json::<JwkSet>()
        .await
        .map_err(|_| ApiError::InternalServerError)?;

    oidc.store_jwks(jwks.clone()).await;

    Ok(jwks)
}

fn validate_with_jwks(
    token: &str,
    header: &jsonwebtoken::Header,
    jwks: &JwkSet,
    issuer: &str,
) -> Result<(), TokenValidationFailure> {
    let kid = header.kid.as_deref();
    let mut last_error: Option<ErrorKind> = None;

    for jwk in jwks.keys.iter() {
        if kid.is_some_and(|expected| jwk.common.key_id.as_deref() != Some(expected)) {
            continue;
        }

        if let Some(jwk_alg) = jwk.common.key_algorithm {
            if !algorithms_match(jwk_alg, header.alg) {
                continue;
            }
        }

        let decoding_key = match &jwk.algorithm {
            AlgorithmParameters::RSA(rsa) => DecodingKey::from_rsa_components(&rsa.n, &rsa.e),
            AlgorithmParameters::EllipticCurve(ec) => DecodingKey::from_ec_components(&ec.x, &ec.y),
            AlgorithmParameters::OctetKey(oct) => {
                Ok(DecodingKey::from_secret(oct.value.as_bytes()))
            }
            AlgorithmParameters::OctetKeyPair(_) => continue,
        };

        let decoding_key = match decoding_key {
            Ok(key) => key,
            Err(_) => continue,
        };

        let mut validation = Validation::new(header.alg);
        validation.validate_aud = false;
        validation.set_required_spec_claims(&["exp"]);

        if !issuer.is_empty() {
            validation.set_issuer(&[issuer]);
        }

        match decode::<serde_json::Value>(token, &decoding_key, &validation) {
            Ok(_) => return Ok(()),
            Err(err) => last_error = Some(err.into_kind()),
        }
    }

    if let Some(kind) = last_error {
        return Err(TokenValidationFailure::Jwt(kind));
    }

    Err(TokenValidationFailure::NoMatchingKey)
}

fn should_refresh(kind: &ErrorKind) -> bool {
    matches!(kind, ErrorKind::InvalidSignature | ErrorKind::InvalidToken)
}

fn map_error_kind(kind: &ErrorKind) -> ApiError {
    match kind {
        ErrorKind::ExpiredSignature
        | ErrorKind::InvalidToken
        | ErrorKind::InvalidSignature
        | ErrorKind::InvalidIssuer
        | ErrorKind::InvalidAudience => ApiError::Unauthorized,
        _ => ApiError::InternalServerError,
    }
}

fn algorithms_match(jwk_alg: KeyAlgorithm, header_alg: Algorithm) -> bool {
    matches!(
        (jwk_alg, header_alg),
        (KeyAlgorithm::HS256, Algorithm::HS256)
            | (KeyAlgorithm::HS384, Algorithm::HS384)
            | (KeyAlgorithm::HS512, Algorithm::HS512)
            | (KeyAlgorithm::RS256, Algorithm::RS256)
            | (KeyAlgorithm::RS384, Algorithm::RS384)
            | (KeyAlgorithm::RS512, Algorithm::RS512)
            | (KeyAlgorithm::ES256, Algorithm::ES256)
            | (KeyAlgorithm::ES384, Algorithm::ES384)
            | (KeyAlgorithm::PS256, Algorithm::PS256)
            | (KeyAlgorithm::PS384, Algorithm::PS384)
            | (KeyAlgorithm::PS512, Algorithm::PS512)
            | (KeyAlgorithm::EdDSA, Algorithm::EdDSA)
    )
}
