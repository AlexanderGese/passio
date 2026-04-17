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
}
