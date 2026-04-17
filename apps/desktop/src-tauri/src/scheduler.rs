//! Scheduler tick: fires `passio.scan` on the sidecar at a configurable
//! interval. Uses Tauri's async runtime so it runs inside the app executor.

use crate::sidecar::Sidecar;
use serde_json::json;
use std::sync::Arc;
use std::time::Duration;
use tauri::async_runtime::{self, Mutex};

#[derive(Clone)]
pub struct Scheduler {
    sidecar: Sidecar,
    interval_min: Arc<Mutex<u64>>,
}

impl Scheduler {
    pub fn new(sidecar: Sidecar, interval_min: u64) -> Self {
        Self {
            sidecar,
            interval_min: Arc::new(Mutex::new(interval_min.max(5))),
        }
    }

    pub fn spawn(&self) {
        let sidecar = self.sidecar.clone();
        let interval_min = self.interval_min.clone();
        async_runtime::spawn(async move {
            loop {
                let mins = *interval_min.lock().await;
                tokio::time::sleep(Duration::from_secs(mins * 60)).await;
                tracing::info!("scheduler tick");
                match sidecar.call("passio.scan", json!({ "reason": "cron" })).await {
                    Ok(v) => tracing::info!(result = ?v, "scan returned"),
                    Err(e) => tracing::warn!(error = %e, "scan failed"),
                }
            }
        });
    }

    pub async fn set_interval_minutes(&self, m: u64) {
        *self.interval_min.lock().await = m.max(5);
    }
}
