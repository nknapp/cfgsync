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
    #[serde(default)]
    pub group_index: usize,
    pub path: String,
    pub source_mtime: i64,
    pub target_mtime: i64,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub is_symlink: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub symlink_target: Option<String>,
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

    pub fn as_map(&self) -> HashMap<(usize, &str), &FileEntry> {
        self.file
            .iter()
            .map(|e| ((e.group_index, e.path.as_str()), e))
            .collect()
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
                    group_index: 0,
                    path: "etc/nginx.conf".to_string(),
                    source_mtime: 1716634200,
                    target_mtime: 1716634200,
                    is_symlink: false,
                    symlink_target: None,
                },
                FileEntry {
                    group_index: 0,
                    path: "etc/app.conf".to_string(),
                    source_mtime: 1716634300,
                    target_mtime: 1716634300,
                    is_symlink: false,
                    symlink_target: None,
                },
            ],
        };

        let toml_str = toml::to_string_pretty(&state).unwrap();
        let parsed: State = toml::from_str(&toml_str).unwrap();

        assert_eq!(parsed.file.len(), 2);
        let map = parsed.as_map();
        assert_eq!(
            map.get(&(0, "etc/nginx.conf")).unwrap().source_mtime,
            1716634200
        );
        assert_eq!(
            map.get(&(0, "etc/app.conf")).unwrap().source_mtime,
            1716634300
        );
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
                group_index: 0,
                path: "test.conf".to_string(),
                source_mtime: 100,
                target_mtime: 200,
                is_symlink: false,
                symlink_target: None,
            }],
        };

        state.save(&state_path).unwrap();
        let loaded = State::load(&state_path).unwrap();
        assert_eq!(loaded.file.len(), 1);
        assert_eq!(loaded.file[0].path, "test.conf");
        assert_eq!(loaded.file[0].source_mtime, 100);
        assert_eq!(loaded.file[0].target_mtime, 200);
    }

    #[test]
    fn test_state_map_lookup_by_group() {
        let state = State {
            last_sync: Utc::now(),
            file: vec![
                FileEntry {
                    group_index: 0,
                    path: "nginx.conf".to_string(),
                    source_mtime: 100,
                    target_mtime: 100,
                    is_symlink: false,
                    symlink_target: None,
                },
                FileEntry {
                    group_index: 1,
                    path: "nginx.conf".to_string(),
                    source_mtime: 200,
                    target_mtime: 200,
                    is_symlink: false,
                    symlink_target: None,
                },
            ],
        };
        let map = state.as_map();
        assert_eq!(map.get(&(0, "nginx.conf")).unwrap().source_mtime, 100);
        assert_eq!(map.get(&(1, "nginx.conf")).unwrap().source_mtime, 200);
    }

    #[test]
    fn test_old_state_without_group_index() {
        let toml_str = r#"last_sync = "2026-05-25T10:30:00Z"

[[file]]
path = "old.conf"
source_mtime = 100
target_mtime = 100
"#;
        let parsed: State = toml::from_str(toml_str).unwrap();
        assert_eq!(parsed.file.len(), 1);
        assert_eq!(parsed.file[0].group_index, 0);
    }
}
