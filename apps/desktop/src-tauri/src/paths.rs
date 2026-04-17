use anyhow::Result;
use directories::ProjectDirs;
use std::path::PathBuf;

/// XDG-compliant paths: ~/.config/passio, ~/.local/share/passio, etc.
pub struct PassioPaths {
    pub config_dir: PathBuf,
    pub data_dir: PathBuf,
    pub cache_dir: PathBuf,
    pub logs_dir: PathBuf,
    pub screenshots_dir: PathBuf,
}

impl PassioPaths {
    pub fn resolve() -> Result<Self> {
        let dirs = ProjectDirs::from("com", "Passio", "Passio")
            .ok_or_else(|| anyhow::anyhow!("cannot resolve project directories"))?;
        let config_dir = dirs.config_dir().to_path_buf();
        let data_dir = dirs.data_dir().to_path_buf();
        let cache_dir = dirs.cache_dir().to_path_buf();
        let logs_dir = data_dir.join("logs");
        let screenshots_dir = data_dir.join("screenshots");

        for p in [&config_dir, &data_dir, &cache_dir, &logs_dir, &screenshots_dir] {
            std::fs::create_dir_all(p)?;
        }
        Ok(Self {
            config_dir,
            data_dir,
            cache_dir,
            logs_dir,
            screenshots_dir,
        })
    }

    pub fn db_file(&self) -> PathBuf {
        self.data_dir.join("db.sqlite")
    }

    pub fn extension_token_file(&self) -> PathBuf {
        self.config_dir.join("extension-token")
    }

    pub fn secrets_file(&self) -> PathBuf {
        self.config_dir.join("secrets.env")
    }
}

/// Parse a `KEY=VALUE` style secrets file. Lines beginning with `#` and
/// empty lines are ignored. Values may optionally be wrapped in single or
/// double quotes. This is a temporary stand-in until the keychain wizard
/// ships in a later plan.
pub fn load_secrets(path: &std::path::Path) -> std::collections::HashMap<String, String> {
    let mut out = std::collections::HashMap::new();
    let Ok(content) = std::fs::read_to_string(path) else {
        return out;
    };
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some((k, v)) = line.split_once('=') {
            let key = k.trim().to_string();
            let mut val = v.trim().to_string();
            if (val.starts_with('"') && val.ends_with('"'))
                || (val.starts_with('\'') && val.ends_with('\''))
            {
                val = val[1..val.len() - 1].to_string();
            }
            out.insert(key, val);
        }
    }
    out
}
