//! Gate state in the Rust core. Receives `passio.gate.request` notifications
//! from the sidecar, emits them to the HUD, and races a countdown timer
//! against a user verdict coming back via `gate_resolve` IPC.

use parking_lot::Mutex;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;

use crate::sidecar::Sidecar;

#[derive(Clone, Default)]
pub struct GateState {
    pending: Arc<Mutex<HashMap<String, oneshot::Sender<bool>>>>,
}

impl GateState {
    pub fn new() -> Self {
        Self {
            pending: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Handle an incoming gate.request notification from the sidecar.
    /// Spawns a timer that falls back to `allowed=true` after `countdown_seconds`.
    pub fn begin(
        &self,
        handle: AppHandle,
        sidecar: Sidecar,
        params: Value,
        countdown_seconds: u32,
    ) {
        let Some(id) = params.get("id").and_then(|v| v.as_str()).map(str::to_string) else {
            tracing::warn!("gate.request missing id");
            return;
        };

        let (tx, rx) = oneshot::channel::<bool>();
        self.pending.lock().insert(id.clone(), tx);

        // Emit to HUD.
        let mut payload = params.clone();
        if let Some(obj) = payload.as_object_mut() {
            obj.insert("countdown_seconds".into(), json!(countdown_seconds));
        }
        let _ = handle.emit("passio://gate", payload);

        // Fallback timer + forward verdict back to sidecar.
        let pending = self.pending.clone();
        let id_for_task = id.clone();
        tauri::async_runtime::spawn(async move {
            let verdict = tokio::select! {
                v = rx => v.unwrap_or(true),
                _ = tokio::time::sleep(Duration::from_secs(countdown_seconds.max(1) as u64)) => {
                    tracing::info!(id = %id_for_task, "gate timer elapsed — auto-allow");
                    true
                }
            };
            // Clean up if we won via timer (resolver never fired).
            pending.lock().remove(&id_for_task);
            if let Err(e) = sidecar
                .call(
                    "passio.gate.resolve",
                    json!({ "id": id_for_task, "allowed": verdict }),
                )
                .await
            {
                tracing::warn!(error = %e, "gate.resolve to sidecar failed");
            }
            // Tell HUD to close the toast (verdict applied).
            let _ = handle.emit(
                "passio://gate-resolved",
                json!({ "id": id_for_task, "allowed": verdict }),
            );
        });
    }

    /// Called by HUD via IPC when user presses Allow/Cancel/Always.
    pub fn resolve(&self, id: &str, allowed: bool) -> bool {
        if let Some(tx) = self.pending.lock().remove(id) {
            let _ = tx.send(allowed);
            true
        } else {
            false
        }
    }
}
