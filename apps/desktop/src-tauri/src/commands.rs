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

#[tauri::command]
pub async fn chat(
    sidecar: State<'_, Sidecar>,
    prompt: String,
    conversation_id: Option<i64>,
) -> Result<Value, String> {
    let params = match conversation_id {
        Some(id) => json!({ "prompt": prompt, "conversationId": id }),
        None => json!({ "prompt": prompt }),
    };
    sidecar
        .call("passio.chat", params)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn todo_list(
    sidecar: State<'_, Sidecar>,
    filter: Option<String>,
) -> Result<Value, String> {
    let params = json!({ "filter": filter.unwrap_or_else(|| "open".into()) });
    sidecar
        .call("passio.todo.list", params)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn memory_search(
    sidecar: State<'_, Sidecar>,
    query: String,
    limit: Option<u32>,
) -> Result<Value, String> {
    let params = match limit {
        Some(n) => json!({ "query": query, "limit": n }),
        None => json!({ "query": query }),
    };
    sidecar
        .call("passio.memory.search", params)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn goal_list(
    sidecar: State<'_, Sidecar>,
    status: Option<String>,
) -> Result<Value, String> {
    let params = json!({ "status": status.unwrap_or_else(|| "active".into()) });
    sidecar
        .call("passio.goal.list", params)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn goal_create(
    sidecar: State<'_, Sidecar>,
    payload: Value,
) -> Result<Value, String> {
    sidecar
        .call("passio.goal.create", payload)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn milestone_done(
    sidecar: State<'_, Sidecar>,
    id: i64,
) -> Result<Value, String> {
    sidecar
        .call("passio.milestone.done", json!({ "id": id }))
        .await
        .map_err(|e| e.to_string())
}
