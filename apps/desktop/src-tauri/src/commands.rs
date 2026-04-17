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

#[tauri::command]
pub async fn bridge_status(sidecar: State<'_, Sidecar>) -> Result<Value, String> {
    sidecar
        .call("passio.bridge.status", json!({}))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn summarize_page(
    sidecar: State<'_, Sidecar>,
    style: Option<String>,
) -> Result<Value, String> {
    let params = json!({ "style": style.unwrap_or_else(|| "bullet".into()) });
    sidecar
        .call("passio.browser.summarizePage", params)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn focus_state(sidecar: State<'_, Sidecar>) -> Result<Value, String> {
    sidecar.call("passio.focus.getState", json!({})).await.map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn focus_start(
    sidecar: State<'_, Sidecar>,
    duration_min: Option<u32>,
) -> Result<Value, String> {
    let params = json!({ "duration_min": duration_min.unwrap_or(25) });
    sidecar.call("passio.focus.start", params).await.map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn focus_stop(sidecar: State<'_, Sidecar>) -> Result<Value, String> {
    sidecar.call("passio.focus.stop", json!({})).await.map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn pack_get(sidecar: State<'_, Sidecar>) -> Result<Value, String> {
    sidecar.call("passio.pack.get", json!({})).await.map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn pack_set(
    sidecar: State<'_, Sidecar>,
    pack: String,
) -> Result<Value, String> {
    sidecar.call("passio.pack.set", json!({ "pack": pack })).await.map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn pack_cycle(sidecar: State<'_, Sidecar>) -> Result<Value, String> {
    sidecar.call("passio.pack.cycle", json!({})).await.map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn dnd_get(sidecar: State<'_, Sidecar>) -> Result<Value, String> {
    sidecar.call("passio.dnd.get", json!({})).await.map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn dnd_toggle(sidecar: State<'_, Sidecar>) -> Result<Value, String> {
    sidecar.call("passio.dnd.toggle", json!({})).await.map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn dnd_set(
    sidecar: State<'_, Sidecar>,
    minutes: Option<i32>,
) -> Result<Value, String> {
    sidecar
        .call("passio.dnd.set", json!({ "minutes": minutes }))
        .await
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn proactive_get(sidecar: State<'_, Sidecar>) -> Result<Value, String> {
    sidecar.call("passio.proactive.get", json!({})).await.map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn proactive_set(
    sidecar: State<'_, Sidecar>,
    mode: Option<String>,
    interval_min: Option<u32>,
) -> Result<Value, String> {
    let mut obj = serde_json::Map::new();
    if let Some(m) = mode { obj.insert("mode".into(), Value::String(m)); }
    if let Some(n) = interval_min { obj.insert("interval_min".into(), json!(n)); }
    sidecar.call("passio.proactive.set", Value::Object(obj)).await.map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn morning_briefing(sidecar: State<'_, Sidecar>) -> Result<Value, String> {
    sidecar.call("passio.morningBriefing", json!({})).await.map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn daily_recap(sidecar: State<'_, Sidecar>) -> Result<Value, String> {
    sidecar.call("passio.dailyRecap", json!({})).await.map_err(|e| e.to_string())
}
