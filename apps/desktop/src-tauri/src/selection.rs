//! X11 PRIMARY / CLIPBOARD access via xsel.
//!
//! We shell out to `xsel` so we don't pull in a full X11 dep for a handful
//! of clipboard ops. On Xfce/X11 this is the cleanest path — the user
//! selects text in any app, Passio reads PRIMARY selection, transforms it,
//! and writes the result back to CLIPBOARD for pasting.

use anyhow::{anyhow, Result};
use tokio::io::AsyncWriteExt;
use tokio::process::Command;

async fn have_xsel() -> bool {
    Command::new("xsel")
        .arg("--version")
        .output()
        .await
        .is_ok()
}

pub async fn get_primary() -> Result<String> {
    if !have_xsel().await {
        return Err(anyhow!(
            "`xsel` not installed — `sudo apt install xsel` to enable selection hotkeys"
        ));
    }
    let out = Command::new("xsel")
        .args(["--primary", "--output"])
        .output()
        .await?;
    if !out.status.success() {
        return Err(anyhow!("xsel --primary failed"));
    }
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if s.is_empty() {
        return Err(anyhow!(
            "no text selected — highlight something first (X11 primary selection)"
        ));
    }
    Ok(s)
}

pub async fn set_clipboard(text: &str) -> Result<()> {
    if !have_xsel().await {
        return Err(anyhow!("`xsel` not installed"));
    }
    let mut child = Command::new("xsel")
        .args(["--clipboard", "--input"])
        .stdin(std::process::Stdio::piped())
        .spawn()?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(text.as_bytes()).await?;
        drop(stdin);
    }
    let status = child.wait().await?;
    if !status.success() {
        return Err(anyhow!("xsel --clipboard failed"));
    }
    Ok(())
}
