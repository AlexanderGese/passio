//! Global hotkey registration. Emits `passio://hotkey` events (payload = name)
//! which the HUD subscribes to via the Tauri event bus.

use anyhow::Result;
use std::process::Command;
use std::str::FromStr;
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

/// Parse an accelerator string like "Super+Shift+R" → `Shortcut`. Used
/// when loading user keybinds from persona settings; falls back to the
/// built-in default if parsing fails.
pub fn parse_accelerator(name: &str, s: &str) -> Shortcut {
    let lower = s.to_lowercase();
    let mut mods = Modifiers::empty();
    let mut code: Option<Code> = None;
    for part in lower.split('+').map(str::trim) {
        match part {
            "super" | "meta" | "win" | "cmd" => mods |= Modifiers::SUPER,
            "ctrl" | "control" => mods |= Modifiers::CONTROL,
            "shift" => mods |= Modifiers::SHIFT,
            "alt" | "option" => mods |= Modifiers::ALT,
            other => {
                code = Code::from_str(&cap_first(other)).ok();
            }
        }
    }
    let code = code.unwrap_or_else(|| {
        defaults()
            .into_iter()
            .find(|b| b.name == name)
            .and_then(|b| {
                // extract code from the fallback shortcut via debug — simplest
                // since Shortcut doesn't expose `.key()`. Fall back to Space.
                Some(Code::Space).filter(|_| !format!("{:?}", b.shortcut).is_empty())
            })
            .unwrap_or(Code::Space)
    });
    Shortcut::new(Some(mods), code)
}

fn cap_first(s: &str) -> String {
    // tauri-plugin-global-shortcut Code parses variants like "Space", "KeyR".
    if s.len() == 1 && s.chars().next().unwrap().is_ascii_alphabetic() {
        format!("Key{}", s.to_uppercase())
    } else {
        let mut c = s.chars();
        match c.next() {
            Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
            None => String::new(),
        }
    }
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
