//! Global hotkey registration. Emits `passio://hotkey` events (payload = name)
//! which the HUD subscribes to via the Tauri event bus.

use anyhow::Result;
use std::process::Command;
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
        Binding {
            shortcut: Shortcut::new(Some(Modifiers::SUPER), Code::KeyB),
            name: "toggle-bubble",
        },
        Binding {
            shortcut: Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyN),
            name: "force-scan",
        },
        Binding {
            shortcut: Shortcut::new(Some(Modifiers::SUPER | Modifiers::ALT), Code::Space),
            name: "ptt",
        },
        Binding {
            shortcut: Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyR),
            name: "rewrite-selection",
        },
        Binding {
            shortcut: Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyL),
            name: "translate-selection",
        },
    ]
}

pub fn register_defaults(app: &AppHandle) -> Result<()> {
    let gs = app.global_shortcut();

    let bindings = defaults();
    let shortcuts: Vec<Shortcut> = bindings.iter().map(|b| b.shortcut).collect();
    let lookup: Vec<(Shortcut, &'static str)> =
        bindings.iter().map(|b| (b.shortcut, b.name)).collect();

    let emitter = app.clone();
    // `on_shortcuts` in tauri-plugin-global-shortcut 2.3 registers the
    // shortcuts AND installs the handler. Do NOT also call `register(...)`
    // separately — that produces "HotKey already registered" errors.
    gs.on_shortcuts(shortcuts, move |_app, shortcut, event| {
        if !matches!(event.state(), ShortcutState::Pressed) {
            return;
        }
        let name = lookup
            .iter()
            .find(|(s, _)| s == shortcut)
            .map(|(_, n)| *n)
            .unwrap_or("unknown");
        tracing::info!(%name, "hotkey fired");
        let _ = emitter.emit("passio://hotkey", name);
    })?;

    for b in &bindings {
        tracing::info!(name = b.name, "shortcut registered");
    }

    // Opportunistic conflict check against Xfce bindings.
    if let Ok(out) = Command::new("xfconf-query")
        .args(["-c", "xfce4-keyboard-shortcuts", "-l"])
        .output()
    {
        if out.status.success() {
            let listing = String::from_utf8_lossy(&out.stdout);
            let ours: Vec<(&'static str, &'static str)> = vec![
                ("quick-chat", "<Super>space"),
                ("toggle-bubble", "<Super>b"),
                ("force-scan", "<Super><Shift>n"),
                ("ptt", "<Super><Alt>space"),
                ("rewrite-selection", "<Super><Shift>r"),
                ("translate-selection", "<Super><Shift>l"),
            ];
            let lower = listing.to_lowercase();
            for (name, combo) in ours {
                if lower.contains(&combo.to_lowercase()) {
                    tracing::warn!(name, combo, "Xfce already binds this combo — consider rebinding in Settings");
                }
            }
        }
    }

    Ok(())
}
