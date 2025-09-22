use axum::{http::StatusCode, response::IntoResponse};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ApiError {
    #[error("not found")] // this is what will be printed in the log/http response
    NotFound,
    #[error("internal server error")]
    InternalServerError,
    #[error("bad request")]
    BadRequest,
    #[error("unauthorized")]
    Unauthorized,
    #[error("too many requests")]
    TooManyRequests,
    #[error("setup error")]
    SetupError,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        // Mappings from Rust errors to standard HTTP status codes
        match self {
            Self::NotFound => StatusCode::NOT_FOUND,
            Self::InternalServerError => StatusCode::INTERNAL_SERVER_ERROR,
            Self::BadRequest => StatusCode::BAD_REQUEST,
            Self::Unauthorized => StatusCode::UNAUTHORIZED,
            Self::TooManyRequests => StatusCode::TOO_MANY_REQUESTS,
            Self::SetupError => StatusCode::INTERNAL_SERVER_ERROR,
        }
        .into_response()
    }
}

impl From<ApiError> for axum::response::Response {
    fn from(value: ApiError) -> Self {
        value.into_response()
    }
}
