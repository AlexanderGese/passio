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
    goal_id: Option<i64>,
) -> Result<Value, String> {
    let mut obj = serde_json::Map::new();
    obj.insert("prompt".into(), Value::String(prompt));
    if let Some(id) = conversation_id {
        obj.insert("conversationId".into(), json!(id));
    }
    if let Some(gid) = goal_id {
        obj.insert("goalId".into(), json!(gid));
    }
    sidecar
        .call("passio.chat", Value::Object(obj))
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

#[tauri::command]
pub async fn voice_transcribe(
    sidecar: State<'_, Sidecar>,
    audio_base64: String,
    mime_type: Option<String>,
    language: Option<String>,
) -> Result<Value, String> {
    let mut obj = serde_json::Map::new();
    obj.insert("audio_base64".into(), Value::String(audio_base64));
    if let Some(m) = mime_type { obj.insert("mime_type".into(), Value::String(m)); }
    if let Some(l) = language { obj.insert("language".into(), Value::String(l)); }
    sidecar
        .call("passio.voice.transcribe", Value::Object(obj))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn voice_synthesize(
    sidecar: State<'_, Sidecar>,
    text: String,
    voice: Option<String>,
) -> Result<Value, String> {
    let mut obj = serde_json::Map::new();
    obj.insert("text".into(), Value::String(text));
    if let Some(v) = voice { obj.insert("voice".into(), Value::String(v)); }
    sidecar
        .call("passio.voice.synthesize", Value::Object(obj))
        .await
        .map_err(|e| e.to_string())
}

// ---- OS keyring ----
#[tauri::command]
pub async fn keychain_set(key: String, value: String) -> Result<(), String> {
    crate::keychain::set_secret(&key, &value).map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn keychain_has(key: String) -> Result<bool, String> {
    Ok(crate::keychain::get_secret(&key).map_err(|e| e.to_string())?.is_some())
}
#[tauri::command]
pub async fn keychain_delete(key: String) -> Result<(), String> {
    crate::keychain::delete_secret(&key).map_err(|e| e.to_string())
}

// ---- Safety rails / policy / gate ----

#[tauri::command]
pub async fn policy_get(sidecar: State<'_, Sidecar>) -> Result<Value, String> {
    sidecar.call("passio.policy.get", json!({})).await.map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn policy_set(
    sidecar: State<'_, Sidecar>,
    host: String,
    policy: String,
) -> Result<Value, String> {
    sidecar
        .call("passio.policy.set", json!({ "host": host, "policy": policy }))
        .await
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn policy_delete(
    sidecar: State<'_, Sidecar>,
    host: String,
) -> Result<Value, String> {
    sidecar
        .call("passio.policy.delete", json!({ "host": host }))
        .await
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn policy_set_countdown(
    sidecar: State<'_, Sidecar>,
    seconds: u32,
) -> Result<Value, String> {
    sidecar
        .call("passio.policy.setCountdown", json!({ "seconds": seconds }))
        .await
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn blocklist_set(
    sidecar: State<'_, Sidecar>,
    entries: Value,
) -> Result<Value, String> {
    sidecar
        .call("passio.blocklist.set", json!({ "entries": entries }))
        .await
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn gate_resolve(
    gate: State<'_, crate::gate::GateState>,
    id: String,
    allowed: bool,
) -> Result<(), String> {
    gate.resolve(&id, allowed);
    Ok(())
}

// ---- Personalisation ----

#[tauri::command]
pub async fn persona_get(sidecar: State<'_, Sidecar>) -> Result<Value, String> {
    sidecar.call("passio.persona.get", json!({})).await.map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn persona_set(
    sidecar: State<'_, Sidecar>,
    patch: Value,
) -> Result<Value, String> {
    sidecar.call("passio.persona.set", patch).await.map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn keybinds_get(sidecar: State<'_, Sidecar>) -> Result<Value, String> {
    sidecar.call("passio.keybinds.get", json!({})).await.map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn keybinds_set(
    sidecar: State<'_, Sidecar>,
    patch: Value,
) -> Result<Value, String> {
    sidecar.call("passio.keybinds.set", patch).await.map_err(|e| e.to_string())
}

/// Generic sidecar passthrough. The HUD uses this for v2 settings surfaces
/// where adding a dedicated Rust command per RPC isn't worth the code.
/// Allow-list on the frontend side; this just forwards.
#[tauri::command]
pub async fn sidecar_passthrough(
    sidecar: State<'_, Sidecar>,
    method: String,
    params: Option<Value>,
) -> Result<Value, String> {
    sidecar
        .call(&method, params.unwrap_or(Value::Object(Default::default())))
        .await
        .map_err(|e| e.to_string())
}

// ---- Seeds: dynamic hotkey registration ----
#[tauri::command]
pub async fn register_seed_hotkeys(
    app: tauri::AppHandle,
    list: Vec<(String, String)>,
) -> Result<(), String> {
    crate::hotkeys::set_seed_hotkeys(&app, list).map_err(|e| e.to_string())
}

// ---- Bubble window sizing (click-through fix) ----
#[tauri::command]
pub async fn set_bubble_expanded(
    app: tauri::AppHandle,
    expanded: bool,
) -> Result<(), String> {
    crate::resize_bubble_window(&app, expanded).map_err(|e| e.to_string())
}

// ---- Spotlight window mode (centered launcher) ----
#[tauri::command]
pub async fn set_spotlight_window(
    app: tauri::AppHandle,
    open: bool,
    bubble_expanded: bool,
) -> Result<(), String> {
    if open {
        crate::open_spotlight_window(&app).map_err(|e| e.to_string())
    } else {
        // Restore the bubble to whatever size the HUD had before spotlight.
        crate::resize_bubble_window(&app, bubble_expanded).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub async fn resize_spotlight(app: tauri::AppHandle, height: f64) -> Result<(), String> {
    crate::resize_spotlight_height(&app, height).map_err(|e| e.to_string())
}

// ---- Clipboard history + paste ----
#[tauri::command]
pub fn clipboard_history_list() -> Vec<String> {
    crate::clipboard_history::history()
}

#[tauri::command]
pub async fn clipboard_paste(text: String) -> Result<(), String> {
    crate::clipboard_history::paste_text(&text).map_err(|e| e.to_string())
}

// ---- System actions (Spotlight) ----
#[tauri::command]
pub async fn run_system_action(id: String) -> Result<(), String> {
    // Conservative set — no shutdown/logout, to keep the spotlight from being
    // a one-keystroke way to lose work.
    let (bin, args): (&str, Vec<String>) = match id.as_str() {
        "lock" => ("xdg-screensaver", vec!["lock".into()]),
        "suspend" => ("systemctl", vec!["suspend".into()]),
        "brightness-up" => ("brightnessctl", vec!["s".into(), "+10%".into()]),
        "brightness-down" => ("brightnessctl", vec!["s".into(), "10%-".into()]),
        _ => return Err(format!("unknown system action: {id}")),
    };
    std::process::Command::new(bin)
        .args(&args)
        .spawn()
        .map_err(|e| format!("{bin}: {e}"))?;
    Ok(())
}

// ---- Launch a Desktop Entry Exec line (Spotlight) ----
#[tauri::command]
pub async fn launch_app_exec(exec: String) -> Result<(), String> {
    // Strip Desktop Entry field codes (%f, %F, %u, %U, %i, %c, %k) per spec.
    let cleaned: Vec<&str> = exec
        .split_whitespace()
        .filter(|tok| !matches!(*tok, "%f" | "%F" | "%u" | "%U" | "%i" | "%c" | "%k"))
        .collect();
    if cleaned.is_empty() {
        return Err("empty Exec".into());
    }
    // Double-fork via setsid so the child outlives Passio and doesn't inherit
    // our stdio. We go through sh -c so quoted arguments in Exec are honored.
    let line = cleaned.join(" ");
    std::process::Command::new("sh")
        .arg("-c")
        .arg(format!("setsid nohup {} >/dev/null 2>&1 &", line))
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ---- First-run helpers ----
#[tauri::command]
pub async fn first_run_done(sidecar: State<'_, Sidecar>) -> Result<bool, String> {
    // We piggy-back on the sidecar's settings table via a small helper RPC.
    let res: Value = sidecar
        .call("passio.intent.get", json!({}))
        .await
        .unwrap_or(Value::Null);
    // This is only used to start the sidecar up; the wizard decides
    // finality by checking whether a key exists in the keyring.
    Ok(!res.is_null())
}
