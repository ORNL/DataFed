mod app_config;
mod errors;
#[cfg(feature = "metrics")]
mod metrics;
mod middleware;
mod router;
pub mod services;
mod state;

use middleware::create_correlation_id;
use tokio::signal;
use tower_http::{
    compression::{CompressionLayer, DefaultPredicate, Predicate, predicate::SizeAbove},
    trace::TraceLayer,
};

pub use app_config::*;
pub use errors::*;
pub use state::*;

// This will allow the application to shut down gracefully,
// and finish executing whatever tasks are currently active,
// which will work for restarting containers in docker/k8s
// as they send a SIGKILL signal when they restart
async fn shutdown_signal(message: impl AsRef<str>) {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }

    tracing::info!("{}", message.as_ref());
}

pub async fn start(app_config: AppConfig) -> anyhow::Result<()> {
    let router = router::create_router();

    // Form the state object that will be available in any route
    let state = ApiState {
        oidc: OIDC::new(app_config.oidc).await?,
    };

    // Add relevant request information to logs
    let trace_layer =
        TraceLayer::new_for_http().make_span_with(|request: &axum::http::Request<_>| {
            tracing::info_span!(
                "request",
                method = %request.method(),
                uri = %request.uri(),
                version = ?request.version(),
                correlation_id = %create_correlation_id(request)
            )
        });

    // Compress http bodies if they are over a certain size
    let compression_layer =
        CompressionLayer::new().compress_when(DefaultPredicate::new().and(SizeAbove::new(1024)));

    let api_addr = format!("{}:{}", app_config.api.url, app_config.api.port);

    let listener = tokio::net::TcpListener::bind(api_addr.clone())
        .await
        .expect("unable to start web server");

    tracing::info!("started http server at {}", api_addr);

    let app = router
        .with_state(state)
        .layer(trace_layer)
        .layer(compression_layer);

    // Start the metrics http server separately
    #[cfg(feature = "metrics")]
    metrics::serve_metrics_server(app_config.metrics);

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal("Shutting down API server"))
        .await
        .expect("unable to start web server");

    Ok(())
}
