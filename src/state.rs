use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct State {
    pub last_sync: DateTime<Utc>,
    #[serde(default)]
    pub file: Vec<FileEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub path: String,
    pub source_mtime: i64,
    pub target_mtime: i64,
}

impl State {
    pub fn empty() -> Self {
        State {
            last_sync: Utc::now(),
            file: Vec::new(),
        }
    }

    pub fn load(path: &Path) -> Result<Self, String> {
        if !path.exists() {
            return Ok(State::empty());
        }
        let content = std::fs::read_to_string(path)
            .map_err(|e| format!("Cannot read state file '{}': {}", path.display(), e))?;
        toml::from_str(&content).map_err(|e| {
            format!(
                "Invalid state file '{}': {}. Delete it and re-sync to recover.",
                path.display(),
                e
            )
        })
    }

    pub fn save(&self, path: &Path) -> Result<(), String> {
        let content =
            toml::to_string_pretty(self).map_err(|e| format!("Cannot serialize state: {}", e))?;
        std::fs::write(path, &content)
            .map_err(|e| format!("Cannot write state file '{}': {}", path.display(), e))
    }

    pub fn as_map(&self) -> HashMap<&str, &FileEntry> {
        self.file.iter().map(|e| (e.path.as_str(), e)).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_state_empty_creates_map() {
        let state = State {
            last_sync: Utc::now(),
            file: vec![],
        };
        let map = state.as_map();
        assert!(map.is_empty());
    }

    #[test]
    fn test_state_serialize_deserialize() {
        let state = State {
            last_sync: DateTime::parse_from_rfc3339("2026-05-25T10:30:00Z")
                .unwrap()
                .to_utc(),
            file: vec![
                FileEntry {
                    path: "etc/nginx.conf".to_string(),
                    source_mtime: 1716634200,
                    target_mtime: 1716634200,
                },
                FileEntry {
                    path: "etc/app.conf".to_string(),
                    source_mtime: 1716634300,
                    target_mtime: 1716634300,
                },
            ],
        };

        let toml_str = toml::to_string_pretty(&state).unwrap();
        let parsed: State = toml::from_str(&toml_str).unwrap();

        assert_eq!(parsed.file.len(), 2);
        let map = parsed.as_map();
        assert_eq!(map.get("etc/nginx.conf").unwrap().source_mtime, 1716634200);
        assert_eq!(map.get("etc/app.conf").unwrap().source_mtime, 1716634300);
    }

    #[test]
    fn test_load_empty_state_file() {
        let dir = tempfile::TempDir::new().unwrap();
        let state_path = dir.path().join("config.state");
        let state = State::load(&state_path).unwrap();
        assert!(state.file.is_empty());
    }

    #[test]
    fn test_save_and_load_state() {
        let dir = tempfile::TempDir::new().unwrap();
        let state_path = dir.path().join("config.state");

        let state = State {
            last_sync: DateTime::parse_from_rfc3339("2026-05-25T10:30:00Z")
                .unwrap()
                .to_utc(),
            file: vec![FileEntry {
                path: "test.conf".to_string(),
                source_mtime: 100,
                target_mtime: 200,
            }],
        };

        state.save(&state_path).unwrap();
        let loaded = State::load(&state_path).unwrap();
        assert_eq!(loaded.file.len(), 1);
        assert_eq!(loaded.file[0].path, "test.conf");
        assert_eq!(loaded.file[0].source_mtime, 100);
        assert_eq!(loaded.file[0].target_mtime, 200);
    }
}
