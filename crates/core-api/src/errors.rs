use axum::{http::StatusCode, response::IntoResponse};
use datafed_database::DatabaseError;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ApiError {
    #[error("not found")]
    NotFound,
    #[error("internal ierver error")]
    InternalServerError,
    #[error("bad request")]
    BadRequest,
    #[error("setup error")]
    SetupError,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        match self {
            Self::NotFound => StatusCode::NOT_FOUND,
            Self::InternalServerError => StatusCode::INTERNAL_SERVER_ERROR,
            Self::BadRequest => StatusCode::BAD_REQUEST,
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

impl From<DatabaseError> for ApiError {
    fn from(value: DatabaseError) -> Self {
        match value {
            DatabaseError::NotFound => Self::NotFound,
            _ => Self::InternalServerError,
        }
    }
}
