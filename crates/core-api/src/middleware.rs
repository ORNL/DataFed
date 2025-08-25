use std::str::FromStr;

use axum::http::Request;
use uuid::Uuid;

// Check for a correlation ID header, and if there is none, create one
pub fn create_correlation_id<T>(req: &Request<T>) -> Uuid {
    match req.headers().get("x-correlation-id") {
        Some(header_value) => {
            Uuid::from_str(header_value.to_str().unwrap_or_default()).unwrap_or_default()
        }
        None => Uuid::new_v4(),
    }
}
