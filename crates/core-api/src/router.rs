use axum::Router;
use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_swagger_ui::SwaggerUi;

use crate::{ApiState, services};

#[derive(OpenApi)]
#[openapi(info(title = "kraken_auth", description = "My Api description"))]
struct ApiDoc;

pub fn create_router() -> Router<ApiState> {
    let (router, openapi) = OpenApiRouter::with_openapi(ApiDoc::openapi())
        .merge(services::router())
        .split_for_parts();

    router.merge(SwaggerUi::new("/swagger-ui").url("/api-docs/open-api.json", openapi))
    // .nest("/oauth2", oauth2::create_router())
}
