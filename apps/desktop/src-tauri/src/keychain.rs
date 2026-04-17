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
    entry(key)?.set_password(value).context("set_password")
}

pub fn get_secret(key: &str) -> Result<Option<String>> {
    match entry(key)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(keyring::Error::PlatformFailure(_)) => Ok(None), // daemon missing
        Err(e) => Err(anyhow::Error::from(e)),
    }
}

pub fn delete_secret(key: &str) -> Result<()> {
    match entry(key)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(anyhow::Error::from(e)),
    }
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
    out
}
