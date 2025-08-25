use axum::Router;
use axum::routing::get;
use prometheus::IntCounterVec;
use prometheus::register_int_counter_vec;
use serde::Deserialize;
use std::sync::LazyLock;
use tower_http::trace::TraceLayer;

/**
 * The reason the metrics server is not served on the same http server
 * is because of the common use case that you want your metrics to only
 * be able to be visible from inside of your network, and hosting it on
 * a separate port simplifies that configuation greatly, while not adding
 * much computational overhead.
 */

#[derive(Deserialize)]
pub struct MetricsConfig {
    url: String,
    port: u16,
}

pub fn serve_metrics_server(config: MetricsConfig) {
    let addr = format!("{}:{}", config.url, config.port);

    tokio::task::spawn(async move {
        let listener = tokio::net::TcpListener::bind(addr.clone())
            .await
            .expect("unable to start metrics server");

        let app = Router::new().route("/metrics", get(metrics)).layer(
            TraceLayer::new_for_http().make_span_with(|request: &axum::http::Request<_>| {
                tracing::info_span!(
                    "request",
                    method = %request.method(),
                    uri = %request.uri(),
                    version = ?request.version(),
                    correlation_id = %create_correlation_id(request)
                )
            }),
        );

        tracing::info!("started metrics server on {}", addr);

        axum::serve(listener, app)
            .with_graceful_shutdown(shutdown_signal("Shutting down metrics server"))
            .await
            .expect("unable to start metrics server");
    });

    // It is not strictly necessary to initialize the metrics labels,
    // however its easier to work with in development in grafana
    // #[allow(clippy::single_element_loop)]
    // for m in &["GET", "POST", "PATCH", "DELETE"] {
    //     for o in &[] {
    //         REQUEST_COUNT.with_label_values(&[m, o]);
    //     }
    // }
}

async fn metrics() -> String {
    prometheus::TextEncoder::new()
        .encode_to_string(&prometheus::gather())
        .unwrap()
}

pub enum Method {
    Get,
    Post,
    Patch,
    Delete,
}

pub enum Object {
    User,
}

pub static REQUEST_COUNT: LazyLock<IntCounterVec> = LazyLock::new(|| {
    register_int_counter_vec!(
        "request_count",                           // label name
        "Number of requests by method and object", // description
        &["method", "object"]                      // sub-label names
    )
    // Unwrapping here is okay as this happens at the start of execution
    // so the failure will be found immediately
    .unwrap()
});

#[allow(unused)]
macro_rules! inc {
    ($m:ident for [$( $l:expr ),*]) => {
        $m.with_label_values(&[$($l.into()),*]).inc();
    };
    ($m:ident for $l:expr) => {
        $m.with_label_values(&[$l.into()]).inc();
    };
}

#[allow(unused)]
pub(crate) use inc;

use crate::middleware::create_correlation_id;
use crate::shutdown_signal;

// These are helper methods to convert from Enum to str,
// do to a limitation of the library not accepting Enums directly
impl From<Method> for &str {
    fn from(value: Method) -> Self {
        match value {
            Method::Get => "GET",
            Method::Post => "POST",
            Method::Patch => "PATCH",
            Method::Delete => "DELETE",
        }
    }
}

impl From<Object> for &str {
    fn from(value: Object) -> Self {
        match value {
            Object::User => "user",
        }
    }
}
