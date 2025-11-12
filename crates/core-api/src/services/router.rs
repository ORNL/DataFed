use utoipa_axum::router::OpenApiRouter;

use crate::ApiState;

use super::device_auth;

pub fn router() -> OpenApiRouter<ApiState> {
    // The all-encompassing router for all the routes that
    // should be documented in the OpenAPI spec
    OpenApiRouter::new().merge(device_auth::router())
}
