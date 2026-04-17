use anyhow::Result;
use std::path::Path;
use tracing_appender::{non_blocking::WorkerGuard, rolling};
use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

/// Initialise tracing with daily-rotating file logs + stderr. The returned
/// guard must be held for the lifetime of the application so the background
/// writer thread is not dropped.
pub fn init(logs_dir: &Path) -> Result<WorkerGuard> {
    let appender = rolling::daily(logs_dir, "passio.log");
    let (nb, guard) = tracing_appender::non_blocking(appender);

    let filter = EnvFilter::try_from_env("PASSIO_LOG")
        .unwrap_or_else(|_| EnvFilter::new("info,passio_desktop_lib=debug"));

    tracing_subscriber::registry()
        .with(filter)
        .with(fmt::Layer::new().with_writer(std::io::stderr).with_target(true))
        .with(fmt::Layer::new().with_writer(nb).with_ansi(false).with_target(true))
        .try_init()
        .ok();

    tracing::info!(?logs_dir, "logging initialised");
    Ok(guard)
}
