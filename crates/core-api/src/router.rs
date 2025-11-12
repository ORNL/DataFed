use axum::Router;
use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_swagger_ui::SwaggerUi;

use crate::{ApiState, services};

#[derive(OpenApi)]
#[openapi(info(title = "DataFed", description = "DataFed Core API"))]
struct ApiDoc;

pub fn create_router() -> Router<ApiState> {
    let (router, openapi) = OpenApiRouter::with_openapi(ApiDoc::openapi())
        .merge(services::router())
        .split_for_parts();

    // If you need api routes that you do not want to include in the OpenAPI spec, you will need to nest there router here
    router.merge(SwaggerUi::new("/swagger-ui").url("/api-docs/open-api.json", openapi))
}
