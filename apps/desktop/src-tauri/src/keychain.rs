//! OS-keychain wrapper via the `keyring` crate. Keys live under the
//! service "passio" keyed by purpose ("openai", "anthropic", …). Falls
//! back to `~/.config/passio/secrets.env` for dev environments where
//! the platform keyring daemon isn't running (Kali with no seahorse).

use anyhow::{Context, Result};
use keyring::Entry;

const SERVICE: &str = "passio";

fn entry(key: &str) -> Result<Entry> {
    Entry::new(SERVICE, key).context("create keyring entry")
}

pub fn set_secret(key: &str, value: &str) -> Result<()> {
    match entry(key).and_then(|e| e.set_password(value).context("set_password")) {
        Ok(()) => Ok(()),
        Err(err) => {
            // No keyring daemon on this box — fall back to ~/.config/passio/secrets.env.
            // Preserves W8's promise ('set once, never asked again') on headless /
            // stripped-down Linux setups like Kali without gnome-keyring.
            tracing::warn!(error = %err, "OS keyring unavailable — writing fallback to secrets.env");
            write_fallback(key, value)?;
            Ok(())
        }
    }
}

fn write_fallback(key: &str, value: &str) -> Result<()> {
    use std::fs;
    use std::io::Write;
    use std::os::unix::fs::PermissionsExt;

    let paths = crate::paths::PassioPaths::resolve()?;
    let path = paths.secrets_file();
    let env_key = keyring_key_to_env(key);

    // Read existing lines, strip any prior entry for this key, append the new one.
    let mut kept: Vec<String> = if path.exists() {
        std::fs::read_to_string(&path)?
            .lines()
            .filter(|l| {
                let t = l.trim();
                if t.is_empty() || t.starts_with('#') { return true; }
                !t.starts_with(&format!("{env_key}="))
            })
            .map(|s| s.to_string())
            .collect()
    } else {
        Vec::new()
    };
    kept.push(format!("{env_key}={value}"));

    let mut f = fs::OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&path)?;
    f.write_all(kept.join("\n").as_bytes())?;
    f.write_all(b"\n")?;
    let mut perms = fs::metadata(&path)?.permissions();
    perms.set_mode(0o600);
    fs::set_permissions(&path, perms)?;
    Ok(())
}

fn keyring_key_to_env(key: &str) -> &'static str {
    match key {
        "openai" => "PASSIO_OPENAI_API_KEY",
        "anthropic" => "PASSIO_ANTHROPIC_API_KEY",
        "mail_user" => "PASSIO_MAIL_USER",
        "mail_pass" => "PASSIO_MAIL_APP_PASSWORD",
        "db_cipher" => "PASSIO_DB_CIPHER_KEY",
        "vercel_sandbox_token" => "PASSIO_VERCEL_SANDBOX_TOKEN",
        _ => "PASSIO_UNKNOWN_KEY",
    }
}

pub fn get_secret(key: &str) -> Result<Option<String>> {
    let from_keyring = match entry(key).and_then(|e| {
        e.get_password()
            .map(Some)
            .or_else(|err| match err {
                keyring::Error::NoEntry => Ok(None),
                keyring::Error::PlatformFailure(_) => Ok(None),
                other => Err(anyhow::Error::from(other)),
            })
    }) {
        Ok(v) => v,
        Err(_) => None,
    };
    if from_keyring.is_some() {
        return Ok(from_keyring);
    }
    // Fallback: check secrets.env for the env-var form of this key.
    if let Ok(paths) = crate::paths::PassioPaths::resolve() {
        let secrets = crate::paths::load_secrets(&paths.secrets_file());
        let env_key = keyring_key_to_env(key);
        if let Some(v) = secrets.get(env_key) {
            return Ok(Some(v.clone()));
        }
    }
    Ok(None)
}

pub fn delete_secret(key: &str) -> Result<()> {
    // Best-effort remove from the OS keyring.
    if let Ok(e) = entry(key) {
        match e.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) | Err(keyring::Error::PlatformFailure(_)) => {}
            Err(other) => return Err(anyhow::Error::from(other)),
        }
    }
    // Also strip from fallback secrets.env if present.
    if let Ok(paths) = crate::paths::PassioPaths::resolve() {
        let path = paths.secrets_file();
        if path.exists() {
            let env_key = keyring_key_to_env(key);
            let kept: Vec<String> = std::fs::read_to_string(&path)
                .unwrap_or_default()
                .lines()
                .filter(|l| {
                    let t = l.trim();
                    if t.is_empty() || t.starts_with('#') { return true; }
                    !t.starts_with(&format!("{env_key}="))
                })
                .map(|s| s.to_string())
                .collect();
            let _ = std::fs::write(&path, format!("{}\n", kept.join("\n")));
        }
    }
    Ok(())
}

/// Load all known credentials from the keyring and return them as a
/// `(env_var_name, value)` vec, suitable for `cmd.env(...)` on the
/// sidecar spawn.
pub fn env_from_keyring() -> Vec<(&'static str, String)> {
    let mut out = Vec::new();
    if let Ok(Some(v)) = get_secret("openai") {
        out.push(("PASSIO_OPENAI_API_KEY", v));
    }
    if let Ok(Some(v)) = get_secret("anthropic") {
        out.push(("PASSIO_ANTHROPIC_API_KEY", v));
    }
    if let Ok(Some(v)) = get_secret("mail_user") {
        out.push(("PASSIO_MAIL_USER", v));
    }
    if let Ok(Some(v)) = get_secret("mail_pass") {
        out.push(("PASSIO_MAIL_APP_PASSWORD", v));
    }
    if let Ok(Some(v)) = get_secret("db_cipher") {
        out.push(("PASSIO_DB_CIPHER_KEY", v));
    }
    if let Ok(Some(v)) = get_secret("vercel_sandbox_token") {
        out.push(("PASSIO_VERCEL_SANDBOX_TOKEN", v));
    }
    out
}
