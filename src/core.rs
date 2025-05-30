use datafed_core_api::AppConfig;
use tracing_loki::url::Url;
use tracing_subscriber::{EnvFilter, Registry, fmt, layer::SubscriberExt};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let app_config: AppConfig = toml::from_str(
        tokio::fs::read_to_string("AppSettings.toml")
            .await
            .expect("could not read environment file")
            .as_str(),
    )?;

    let fmt_layer = fmt::layer().with_level(true);

    let env_filter = EnvFilter::from(app_config.rust_log.clone());

    let subscriber = Registry::default().with(env_filter).with(fmt_layer);

    let mut loki_task_controller = None;
    if let Some(ref config) = app_config.loki {
        let (loki_layer, controller, task) = tracing_loki::builder()
            .label("service_name", &config.service_name)?
            .build_controller_url(Url::parse(&config.url).unwrap())?;

        tokio::spawn(task);

        tracing::subscriber::set_global_default(subscriber.with(loki_layer))?;

        loki_task_controller = Some(controller);

        tracing::debug!("started loki task");
    } else {
        tracing::subscriber::set_global_default(subscriber)?;
    };

    datafed_core_api::start(app_config).await?;

    if let Some(controller) = loki_task_controller {
        controller.shutdown().await;
    }

    Ok(())
}
