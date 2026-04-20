//! Clipboard history + paste helper for Spotlight. A background thread polls
//! the X11 CLIPBOARD selection via `xclip`, dedupes, and keeps the last 20
//! non-empty texts in memory. Paste emulates Ctrl+V via `xdotool`.
//!
//! Requires `xclip` and `xdotool` on PATH; both ship on stock Kali/XFCE.
//!
//! No persistence by design — clipboard content often contains secrets, and
//! a file on disk is a footgun. Restart clears the ring.

use parking_lot::Mutex;
use std::collections::VecDeque;
use std::io::Write;
use std::process::{Command, Stdio};
use std::sync::OnceLock;
use std::thread;
use std::time::Duration;

const CAP: usize = 20;
const MAX_LEN: usize = 8_192;

static HISTORY: OnceLock<Mutex<VecDeque<String>>> = OnceLock::new();

pub fn start_poller() {
    HISTORY.get_or_init(|| Mutex::new(VecDeque::with_capacity(CAP)));

    thread::Builder::new()
        .name("clipboard-history".into())
        .spawn(|| {
            let mut last = String::new();
            loop {
                if let Some(text) = read_clipboard() {
                    if !text.is_empty() && text != last && text.len() <= MAX_LEN {
                        let mut h = HISTORY.get().expect("init").lock();
                        // Move existing dup to front instead of inserting twice.
                        if let Some(pos) = h.iter().position(|x| x == &text) {
                            h.remove(pos);
                        }
                        h.push_front(text.clone());
                        while h.len() > CAP {
                            h.pop_back();
                        }
                        last = text;
                    }
                }
                thread::sleep(Duration::from_millis(900));
            }
        })
        .expect("spawn clipboard-history poller");
}

fn read_clipboard() -> Option<String> {
    let out = Command::new("xclip")
        .args(["-selection", "clipboard", "-o"])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    String::from_utf8(out.stdout).ok().map(|s| s.trim_end().to_string())
}

pub fn history() -> Vec<String> {
    HISTORY
        .get()
        .map(|m| m.lock().iter().cloned().collect())
        .unwrap_or_default()
}

pub fn paste_text(text: &str) -> anyhow::Result<()> {
    // Copy to CLIPBOARD selection.
    let mut p = Command::new("xclip")
        .args(["-selection", "clipboard"])
        .stdin(Stdio::piped())
        .spawn()?;
    if let Some(stdin) = p.stdin.as_mut() {
        stdin.write_all(text.as_bytes())?;
    }
    let _ = p.wait()?;
    // Small delay so the spotlight window is already dismissed + the target
    // app has regained focus before we inject the keypress.
    thread::sleep(Duration::from_millis(180));
    let _ = Command::new("xdotool")
        .args(["key", "--clearmodifiers", "ctrl+v"])
        .status();
    Ok(())
}
