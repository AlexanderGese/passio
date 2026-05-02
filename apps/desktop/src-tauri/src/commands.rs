//! Tauri IPC command handlers exposed to the HUD via `invoke(...)`.

use crate::keychain;
use crate::sidecar::Sidecar;
use serde_json::{json, Value};
use tauri::State;

#[tauri::command]
pub async fn ping_sidecar(sidecar: State<'_, Sidecar>) -> Result<Value, String> {
    sidecar.call("passio.ping", json!({})).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn shutdown_sidecar(sidecar: State<'_, Sidecar>) -> Result<(), String> {
    sidecar.call("passio.shutdown", json!({})).await.map_err(|e| e.to_string())?;
    Ok(())
}

// ---- Keychain (OpenAI key etc.) ----
#[tauri::command]
pub async fn keychain_set(name: String, value: String) -> Result<(), String> {
    keychain::set_secret(&name, &value).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn keychain_has(name: String) -> Result<bool, String> {
    Ok(keychain::get_secret(&name).map(|opt| opt.is_some()).unwrap_or(false))
}

#[tauri::command]
pub async fn keychain_delete(name: String) -> Result<(), String> {
    keychain::delete_secret(&name).map_err(|e| e.to_string())
}

// ---- Persona ----
#[tauri::command]
pub async fn persona_get(sidecar: State<'_, Sidecar>) -> Result<Value, String> {
    sidecar.call("passio.persona.get", json!({})).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn persona_set(sidecar: State<'_, Sidecar>, patch: Value) -> Result<Value, String> {
    sidecar.call("passio.persona.set", patch).await.map_err(|e| e.to_string())
}

// ---- Keybinds ----
#[tauri::command]
pub async fn keybinds_get(sidecar: State<'_, Sidecar>) -> Result<Value, String> {
    sidecar.call("passio.keybinds.get", json!({})).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn keybinds_set(sidecar: State<'_, Sidecar>, patch: Value) -> Result<Value, String> {
    sidecar.call("passio.keybinds.set", patch).await.map_err(|e| e.to_string())
}

// ---- Generic sidecar passthrough (the HUD uses this for everything else) ----
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

// ---- Bubble window sizing ----
#[tauri::command]
pub async fn set_bubble_expanded(app: tauri::AppHandle, expanded: bool) -> Result<(), String> {
    crate::resize_bubble_window(&app, expanded).map_err(|e| e.to_string())
}

// ---- Spotlight window mode ----
#[tauri::command]
pub async fn set_spotlight_window(
    app: tauri::AppHandle,
    open: bool,
    bubble_expanded: bool,
) -> Result<(), String> {
    if open {
        crate::open_spotlight_window(&app).map_err(|e| e.to_string())
    } else {
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

// ---- Launch a Desktop Entry Exec line (Spotlight) ----
#[tauri::command]
pub async fn launch_app_exec(exec: String) -> Result<(), String> {
    let cleaned: Vec<&str> = exec
        .split_whitespace()
        .filter(|tok| !matches!(*tok, "%f" | "%F" | "%u" | "%U" | "%i" | "%c" | "%k"))
        .collect();
    if cleaned.is_empty() {
        return Err("empty Exec".into());
    }
    let line = cleaned.join(" ");
    std::process::Command::new("sh")
        .arg("-c")
        .arg(format!("setsid nohup {} >/dev/null 2>&1 &", line))
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ---- System actions ----
#[tauri::command]
pub async fn run_system_action(id: String) -> Result<(), String> {
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
