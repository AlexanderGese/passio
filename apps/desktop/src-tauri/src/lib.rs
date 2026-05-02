//! Passio desktop — Rust core.
//!
//! Responsibilities:
//!   * Window / tray / hotkeys
//!   * Spawn + supervise the Bun sidecar (JSON-RPC over stdio)
//!   * Scheduler tick for proactive scans
//!   * Relay sidecar events to the HUD
//!
//! All AI / memory / tool logic lives in the sidecar, never here.

mod clipboard_history;
mod commands;
mod hotkeys;
mod keychain;
mod logs;
mod paths;
mod sidecar;

use std::sync::Arc;

use sidecar::{Sidecar, SidecarEvent};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, LogicalPosition, Manager,
};

pub fn run() {
    let paths = paths::PassioPaths::resolve().expect("init paths");
    let _log_guard = logs::init(&paths.logs_dir).expect("init logs");
    tracing::info!(version = env!("CARGO_PKG_VERSION"), "starting Passio");

    let sidecar_bin = resolve_sidecar_binary();
    tracing::info!(path = %sidecar_bin.display(), "sidecar binary resolved");

    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .setup(move |app| {
            let handle = app.handle().clone();

            let emit_handle = handle.clone();
            let event_sink: sidecar::EventSink = Arc::new(move |evt: SidecarEvent| {
                forward_event(&emit_handle, evt);
            });

            let sidecar = Sidecar::new(sidecar_bin.clone(), event_sink);
            app.manage(sidecar.clone());

            if let Err(e) = hotkeys::register_defaults(&handle) {
                tracing::warn!(error=%e, "hotkey registration failed");
            }

            // Background poller for the Spotlight clipboard-history source.
            clipboard_history::start_poller();

            if let Err(e) = build_tray(&handle) {
                tracing::warn!(error=%e, "tray setup failed");
            }

            if let Err(e) = dock_bubble(&handle) {
                tracing::warn!(error=%e, "bubble dock failed");
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::ping_sidecar,
            commands::shutdown_sidecar,
            commands::set_bubble_expanded,
            commands::set_spotlight_window,
            commands::resize_spotlight,
            commands::launch_app_exec,
            commands::clipboard_history_list,
            commands::clipboard_paste,
            commands::run_system_action,
            commands::keychain_set,
            commands::keychain_has,
            commands::keychain_delete,
            commands::persona_get,
            commands::persona_set,
            commands::keybinds_get,
            commands::keybinds_set,
            commands::sidecar_passthrough,
        ])
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Keep passio running in tray; just hide the window
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("tauri run");
}

fn forward_event(handle: &AppHandle, evt: SidecarEvent) {
    let (topic, payload) = match evt {
        SidecarEvent::Log { level, message } => (
            "passio://sidecar-log",
            serde_json::json!({ "level": level, "message": message }),
        ),
        SidecarEvent::BubbleState(v) => ("passio://bubble-state", v),
        SidecarEvent::Crash { reason } => (
            "passio://sidecar-crash",
            serde_json::json!({ "reason": reason }),
        ),
        SidecarEvent::SpawnFailed { reason } => (
            "passio://sidecar-spawn-failed",
            serde_json::json!({ "reason": reason }),
        ),
        SidecarEvent::ChatChunk(v) => ("passio://chat-chunk", v),
        SidecarEvent::AutoLoopUpdate(v) => ("passio://auto-loop-update", v),
    };
    let _ = handle.emit(topic, payload);
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let toggle = MenuItem::with_id(app, "toggle", "Toggle bubble", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Passio", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&toggle, &quit])?;

    TrayIconBuilder::with_id("passio-tray")
        .tooltip("Passio")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "toggle" => {
                if let Some(win) = app.get_webview_window("bubble") {
                    if win.is_visible().unwrap_or(false) {
                        let _ = win.hide();
                    } else {
                        let _ = win.show();
                    }
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;
    Ok(())
}

/// Dock the bubble window to the bottom-right corner of the primary monitor.
/// Uses the configured window size (not `outer_size()`, which reports 0 before
/// the window is realised on X11).
const BUBBLE_WIN_W: f64 = 500.0;
const BUBBLE_WIN_H: f64 = 760.0;
const COLLAPSED_WIN_W: f64 = 128.0;
const COLLAPSED_WIN_H: f64 = 128.0;
// Padding from the screen edges. Big enough to clear most Linux taskbars
// (Xfce/Gnome/Plasma) which sit in the bottom ~40px.
const BUBBLE_EDGE_PADDING: f64 = 56.0;

fn dock_bubble(app: &AppHandle) -> tauri::Result<()> {
    // Boot state is collapsed — so the desktop is clickable everywhere
    // except the avatar corner until the user expands.
    resize_bubble_window(app, false)
}

/// Resize + center the bubble window in "spotlight mode" — a ~760×520
/// floating app-launcher card in the middle of the primary monitor. Used
/// when the user triggers Super+Shift+A. `close_spotlight_window` (via
/// `resize_bubble_window`) restores the prior collapsed/expanded layout.
pub const SPOTLIGHT_W: f64 = 760.0;
pub const SPOTLIGHT_H_COMPACT: f64 = 76.0;
pub const SPOTLIGHT_H_MAX: f64 = 520.0;

pub fn open_spotlight_window(app: &AppHandle) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window("bubble") else {
        return Ok(());
    };
    let monitor = window
        .current_monitor()?
        .ok_or(tauri::Error::WindowNotFound)?;
    let monitor_size = monitor.size();
    let scale = monitor.scale_factor();
    let mon_w = monitor_size.width as f64 / scale;
    let mon_h = monitor_size.height as f64 / scale;

    // Anchor the TOP edge of the window at the same vertical position the
    // expanded card would have been centered at — this way when results
    // stream in and the window grows downward, the search bar stays where
    // the user first saw it instead of re-centering on every keystroke.
    let w = SPOTLIGHT_W;
    let h = SPOTLIGHT_H_COMPACT;
    let x = ((mon_w - w) / 2.0).max(0.0);
    let y = ((mon_h - SPOTLIGHT_H_MAX) / 2.0).max(0.0);
    tracing::info!(x, y, w, h, mon_w, mon_h, scale, "spotlight: opening compact");

    window.set_position(LogicalPosition::new(x, y))?;
    window.set_size(tauri::LogicalSize::new(w, h))?;
    window.set_always_on_top(true)?;
    let _ = window.show();
    let _ = window.set_focus();
    window.set_position(LogicalPosition::new(x, y))?;
    Ok(())
}

/// Grow/shrink the spotlight window to match its current content. Height is
/// clamped to [compact, max]; x/y stay fixed so the search bar doesn't jump.
pub fn resize_spotlight_height(app: &AppHandle, height: f64) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window("bubble") else {
        return Ok(());
    };
    let h = height.clamp(SPOTLIGHT_H_COMPACT, SPOTLIGHT_H_MAX);
    window.set_size(tauri::LogicalSize::new(SPOTLIGHT_W, h))?;
    Ok(())
}

/// Resize + reposition the bubble window to match its current collapsed/
/// expanded state. Collapsed = 96×96 (just the avatar), expanded = 500×760.
/// Either way we anchor bottom-right with a 16-px padding.
pub fn resize_bubble_window(app: &AppHandle, expanded: bool) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window("bubble") else {
        return Ok(());
    };
    let monitor = window
        .current_monitor()?
        .ok_or(tauri::Error::WindowNotFound)?;
    let monitor_size = monitor.size();
    let scale = monitor.scale_factor();
    let mon_w = monitor_size.width as f64 / scale;
    let mon_h = monitor_size.height as f64 / scale;

    let (w, h) = if expanded {
        (BUBBLE_WIN_W, BUBBLE_WIN_H)
    } else {
        (COLLAPSED_WIN_W, COLLAPSED_WIN_H)
    };

    let x = (mon_w - w - BUBBLE_EDGE_PADDING).max(0.0);
    let y = (mon_h - h - BUBBLE_EDGE_PADDING).max(0.0);
    tracing::info!(expanded, x, y, w, h, mon_w, mon_h, "sizing bubble window");
    window.set_size(tauri::LogicalSize::new(w, h))?;
    window.set_position(LogicalPosition::new(x, y))?;
    // Some Linux compositors don't raise tiny windows without an explicit
    // focus/show pair — nudge it so the collapsed avatar is always visible.
    let _ = window.show();
    Ok(())
}

/// Locate the Bun sidecar binary. In release builds it lives in the bundle's
/// resources/; in dev it is expected alongside the Tauri project.
fn resolve_sidecar_binary() -> std::path::PathBuf {
    // Prefer explicit env for dev
    if let Ok(p) = std::env::var("PASSIO_SIDECAR_BIN") {
        return p.into();
    }
    // Bundle path (handled by Tauri resource resolution at runtime)
    let here = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()));
    if let Some(dir) = here {
        let candidate = dir.join("resources").join("passio-sidecar");
        if candidate.exists() {
            return candidate;
        }
    }
    // Dev fallback: workspace-relative resources path
    std::path::PathBuf::from("src-tauri/resources/passio-sidecar")
}
