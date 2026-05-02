//! Global hotkey registration. Emits `passio://hotkey` events (payload = name)
//! which the HUD subscribes to via the Tauri event bus.

use anyhow::Result;
use tauri::{AppHandle, Emitter};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

struct Binding {
    shortcut: Shortcut,
    name: &'static str,
}

fn defaults() -> Vec<Binding> {
    vec![
        Binding {
            shortcut: Shortcut::new(Some(Modifiers::SUPER), Code::Space),
            name: "quick-chat",
        },
        // Matches the Windows Copilot key combo (Win+Shift+Space).
        Binding {
            shortcut: Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::Space),
            name: "toggle-bubble",
        },
        // Apple-style cmd-space search.
        Binding {
            shortcut: Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyA),
            name: "spotlight",
        },
    ]
}

pub fn register_defaults(app: &AppHandle) -> Result<()> {
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();

    let defaults = defaults();
    let mut all_shortcuts: Vec<Shortcut> = Vec::with_capacity(defaults.len());
    let mut lookup: Vec<(Shortcut, String)> = Vec::with_capacity(defaults.len());
    for b in &defaults {
        all_shortcuts.push(b.shortcut);
        lookup.push((b.shortcut, b.name.to_string()));
    }

    let emitter = app.clone();
    gs.on_shortcuts(all_shortcuts, move |_app, shortcut, event| {
        if !matches!(event.state(), ShortcutState::Pressed) {
            return;
        }
        let name = lookup
            .iter()
            .find(|(s, _)| s == shortcut)
            .map(|(_, n)| n.clone())
            .unwrap_or_else(|| "unknown".to_string());
        tracing::info!(%name, "hotkey fired");
        let _ = emitter.emit("passio://hotkey", &name);
    })?;
    for b in defaults {
        tracing::info!(name = b.name, "shortcut registered");
    }
    Ok(())
}
