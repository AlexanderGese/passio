//! Tauri IPC command handlers exposed to the HUD via `invoke(...)`.

use crate::sidecar::Sidecar;
use serde_json::{json, Value};
use tauri::State;

#[tauri::command]
pub async fn ping_sidecar(sidecar: State<'_, Sidecar>) -> Result<Value, String> {
    sidecar
        .call("passio.ping", json!({}))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn request_scan(
    sidecar: State<'_, Sidecar>,
    reason: String,
) -> Result<Value, String> {
    sidecar
        .call("passio.scan", json!({ "reason": reason }))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn shutdown_sidecar(sidecar: State<'_, Sidecar>) -> Result<(), String> {
    sidecar.shutdown().await.map_err(|e| e.to_string())
}
