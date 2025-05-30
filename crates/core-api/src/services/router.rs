use utoipa_axum::router::OpenApiRouter;

use crate::ApiState;

use super::user;

pub fn router() -> OpenApiRouter<ApiState> {
    OpenApiRouter::new().merge(user::router())
}
