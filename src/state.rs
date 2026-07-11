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
    pub group: String,
    pub path: String,
    pub hash: String,
    pub perms: String,
    pub owner: String,
    pub mtime: String,
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

    pub fn as_map(&self) -> HashMap<(&str, &str), &FileEntry> {
        self.file
            .iter()
            .map(|e| ((e.group.as_str(), e.path.as_str()), e))
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
                    group: "./target".to_string(),
                    path: "etc/nginx.conf".to_string(),
                    hash: "abc123".to_string(),
                    perms: "644".to_string(),
                    owner: "root:root".to_string(),
                    mtime: "2026-05-25T10:30:00.000Z".to_string(),
                },
                FileEntry {
                    group: "./target".to_string(),
                    path: "etc/app.conf".to_string(),
                    hash: "def456".to_string(),
                    perms: "600".to_string(),
                    owner: "nobody:nogroup".to_string(),
                    mtime: "2026-05-25T10:30:00.000Z".to_string(),
                },
            ],
        };

        let toml_str = toml::to_string_pretty(&state).unwrap();
        let parsed: State = toml::from_str(&toml_str).unwrap();

        assert_eq!(parsed.file.len(), 2);
        let map = parsed.as_map();
        assert_eq!(
            map.get(&("./target", "etc/nginx.conf")).unwrap().perms,
            "644"
        );
        assert_eq!(
            map.get(&("./target", "etc/app.conf")).unwrap().owner,
            "nobody:nogroup"
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
                group: "./target".to_string(),
                path: "test.conf".to_string(),
                hash: "abc123".to_string(),
                perms: "644".to_string(),
                owner: "user:user".to_string(),
                mtime: "2026-05-25T10:30:00.000Z".to_string(),
            }],
        };

        state.save(&state_path).unwrap();
        let loaded = State::load(&state_path).unwrap();
        assert_eq!(loaded.file.len(), 1);
        assert_eq!(loaded.file[0].path, "test.conf");
        assert_eq!(loaded.file[0].hash, "abc123");
        assert_eq!(loaded.file[0].perms, "644");
        assert_eq!(loaded.file[0].owner, "user:user");
        assert_eq!(loaded.file[0].mtime, "2026-05-25T10:30:00.000Z");
    }

    #[test]
    fn test_state_map_lookup_by_group() {
        let state = State {
            last_sync: Utc::now(),
            file: vec![
                FileEntry {
                    group: "./target1".to_string(),
                    path: "nginx.conf".to_string(),
                    hash: "abc".to_string(),
                    perms: "600".to_string(),
                    owner: "root:root".to_string(),
                    mtime: "2026-05-25T10:30:00.000Z".to_string(),
                },
                FileEntry {
                    group: "./target2".to_string(),
                    path: "nginx.conf".to_string(),
                    hash: "def".to_string(),
                    perms: "644".to_string(),
                    owner: "user:user".to_string(),
                    mtime: "2026-05-25T10:30:00.000Z".to_string(),
                },
            ],
        };
        let map = state.as_map();
        assert_eq!(map.get(&("./target1", "nginx.conf")).unwrap().perms, "600");
        assert_eq!(map.get(&("./target2", "nginx.conf")).unwrap().perms, "644");
    }

    #[test]
    fn test_old_state_returns_error() {
        let dir = tempfile::TempDir::new().unwrap();
        let state_path = dir.path().join("config.state");
        std::fs::write(
            &state_path,
            r#"last_sync = "2026-05-25T10:30:00Z"

[[file]]
group_index = 0
path = "old.conf"
source_mtime = 100
target_mtime = 100
"#,
        )
        .unwrap();

        let result = State::load(&state_path);
        assert!(result.is_err(), "old state format should produce an error");
    }
}
