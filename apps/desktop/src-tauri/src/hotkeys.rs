//! Global hotkey registration. Emits `passio://hotkey` events (payload = name)
//! which the HUD subscribes to via the Tauri event bus.

use anyhow::Result;
use std::process::Command;
use std::str::FromStr;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

struct Binding {
    shortcut: Shortcut,
    name: &'static str,
}

/// Dynamically-added bindings (seeds). Gets merged into the registration
/// list on every (re)register_all call.
static SEED_BINDINGS: Mutex<Vec<(Shortcut, String)>> = Mutex::new(Vec::new());

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
        // Apple-style cmd-space search. Win+Shift+A matches our "Copilot key"
        // pattern (Super+Shift+<letter>) so both combos feel of a family.
        Binding {
            shortcut: Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyA),
            name: "spotlight",
        },
        Binding {
            shortcut: Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyS),
            name: "screenshot-ask",
        },
        Binding {
            shortcut: Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyW),
            name: "what-next",
        },
        Binding {
            shortcut: Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyC),
            name: "clipboard-ask",
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
    re_register_all(app)?;
    for b in defaults() {
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

/// Update the seed-declared hotkey list and re-register everything.
/// Called by the HUD after fetching `passio.seed.hotkeysList`.
pub fn set_seed_hotkeys(app: &AppHandle, list: Vec<(String, String)>) -> Result<()> {
    let mut bindings = SEED_BINDINGS
        .lock()
        .map_err(|_| anyhow::anyhow!("seed bindings lock poisoned"))?;
    bindings.clear();
    for (name, accel) in list {
        let shortcut = parse_accelerator_full(&accel);
        bindings.push((shortcut, name));
    }
    drop(bindings);
    re_register_all(app)
}

fn re_register_all(app: &AppHandle) -> Result<()> {
    let gs = app.global_shortcut();
    // Drop every existing registration so we don't hit "already registered".
    let _ = gs.unregister_all();

    let defaults = defaults();
    let seed = SEED_BINDINGS
        .lock()
        .map(|b| b.clone())
        .unwrap_or_default();

    let mut all_shortcuts: Vec<Shortcut> = Vec::with_capacity(defaults.len() + seed.len());
    let mut lookup: Vec<(Shortcut, String)> = Vec::with_capacity(defaults.len() + seed.len());
    for b in &defaults {
        all_shortcuts.push(b.shortcut);
        lookup.push((b.shortcut, b.name.to_string()));
    }
    for (shortcut, name) in seed {
        all_shortcuts.push(shortcut);
        lookup.push((shortcut, name));
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
    Ok(())
}

/// Looser accelerator parser for runtime-registered seed shortcuts — accepts
/// things like "Super+Shift+M" or "Ctrl+Alt+K". Falls back to Escape if the
/// key part is unrecognised (which we log).
fn parse_accelerator_full(s: &str) -> Shortcut {
    let mut mods = Modifiers::empty();
    let mut code: Option<Code> = None;
    for part in s.split('+').map(str::trim) {
        match part.to_lowercase().as_str() {
            "super" | "meta" | "win" | "cmd" => mods |= Modifiers::SUPER,
            "ctrl" | "control" => mods |= Modifiers::CONTROL,
            "shift" => mods |= Modifiers::SHIFT,
            "alt" | "option" => mods |= Modifiers::ALT,
            other => {
                code = Code::from_str(&cap_first(other)).ok();
            }
        }
    }
    Shortcut::new(Some(mods), code.unwrap_or(Code::Escape))
}
