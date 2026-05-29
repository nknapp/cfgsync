use crate::config::{ResolvedConfig, ResolvedFilter};
use crate::state::State;
use std::collections::{BTreeSet, HashSet};
use std::path::{Path, PathBuf};

#[derive(Debug)]
pub struct DiscoveredFile {
    pub rel_path: String,
    pub mtime: i64,
}

#[derive(Debug, PartialEq)]
pub enum Change {
    CopyToTarget {
        rel_path: String,
        abs_src: PathBuf,
        abs_tgt: PathBuf,
    },
    CopyToSource {
        rel_path: String,
        abs_src: PathBuf,
        abs_tgt: PathBuf,
    },
    Conflict {
        rel_path: String,
    },
    DeleteTarget {
        rel_path: String,
        abs_tgt: PathBuf,
    },
    DeleteSource {
        rel_path: String,
        abs_src: PathBuf,
    },
    Cleanup {
        rel_path: String,
    },
}

pub fn classify(
    config: &ResolvedConfig,
    state: &State,
    verbose: bool,
) -> Result<Vec<Change>, String> {
    let source_files = scan_dir(&config.source_dir, &config.filters)?;
    let target_files = scan_dir(&config.target_dir, &config.filters)?;

    if verbose {
        eprintln!(
            "files visited: {} (source) + {} (target) = {} total",
            source_files.len(),
            target_files.len(),
            source_files.len() + target_files.len()
        );
    }

    let state_map = state.as_map();

    let mut all_paths: BTreeSet<&str> = BTreeSet::new();
    for f in &source_files {
        all_paths.insert(&f.rel_path);
    }
    for f in &target_files {
        all_paths.insert(&f.rel_path);
    }
    for path in state_map.keys() {
        all_paths.insert(path);
    }

    let mut changes = Vec::new();

    for rel_path in all_paths {
        let in_source = source_files.iter().find(|f| f.rel_path == rel_path);
        let in_target = target_files.iter().find(|f| f.rel_path == rel_path);
        let in_state = state_map.get(rel_path);
        let abs_src = config.source_dir.join(rel_path);
        let abs_tgt = config.target_dir.join(rel_path);

        match (in_source, in_target, in_state) {
            (Some(s), Some(t), Some(state_entry)) => {
                let src_mod = s.mtime != state_entry.source_mtime;
                let tgt_mod = t.mtime != state_entry.target_mtime;
                if src_mod && tgt_mod {
                    if !files_identical(&abs_src, &abs_tgt) {
                        changes.push(Change::Conflict {
                            rel_path: rel_path.to_string(),
                        });
                    }
                } else if src_mod {
                    changes.push(Change::CopyToTarget {
                        rel_path: rel_path.to_string(),
                        abs_src,
                        abs_tgt,
                    });
                } else if tgt_mod {
                    changes.push(Change::CopyToSource {
                        rel_path: rel_path.to_string(),
                        abs_src,
                        abs_tgt,
                    });
                }
            }

            (Some(_s), None, None) => {
                changes.push(Change::CopyToTarget {
                    rel_path: rel_path.to_string(),
                    abs_src,
                    abs_tgt,
                });
            }

            (None, Some(_t), None) => {
                changes.push(Change::CopyToSource {
                    rel_path: rel_path.to_string(),
                    abs_src,
                    abs_tgt,
                });
            }

            (Some(_s), None, Some(_state_entry)) => {
                changes.push(Change::DeleteSource {
                    rel_path: rel_path.to_string(),
                    abs_src,
                });
            }

            (None, Some(_t), Some(_state_entry)) => {
                changes.push(Change::DeleteTarget {
                    rel_path: rel_path.to_string(),
                    abs_tgt,
                });
            }

            (None, None, Some(_state_entry)) => {
                changes.push(Change::Cleanup {
                    rel_path: rel_path.to_string(),
                });
            }

            (Some(_s), Some(_t), None) => {
                if !files_identical(&abs_src, &abs_tgt) {
                    changes.push(Change::Conflict {
                        rel_path: rel_path.to_string(),
                    });
                }
            }

            // (None, None, None) cannot happen; all rel_paths come from at least one source
            (None, None, None) => {}
        }
    }

    Ok(changes)
}

fn files_identical(a: &Path, b: &Path) -> bool {
    let read_file = |path: &Path| -> Option<Vec<u8>> { std::fs::read(path).ok() };
    match (read_file(a), read_file(b)) {
        (Some(a_contents), Some(b_contents)) => a_contents == b_contents,
        _ => false,
    }
}

fn scan_dir(dir: &Path, filters: &[ResolvedFilter]) -> Result<Vec<DiscoveredFile>, String> {
    let mut files = Vec::new();
    let mut seen = HashSet::new();

    for filter in filters {
        let pattern_str = dir.join(&filter.glob).to_string_lossy().to_string();

        for entry in glob::glob(&pattern_str)
            .map_err(|e| format!("Invalid glob pattern '{}': {}", pattern_str, e))?
        {
            let path = match entry {
                Ok(p) => p,
                Err(e) => {
                    eprintln!("Warning: glob error for '{}': {}", pattern_str, e);
                    continue;
                }
            };

            if !path.is_file() {
                continue;
            }
            if path.is_symlink() {
                eprintln!("Warning: skipping symlink '{}'", path.display());
                continue;
            }

            let rel_path = path
                .strip_prefix(dir)
                .map_err(|e| {
                    format!(
                        "Failed to compute relative path for '{}': {}",
                        path.display(),
                        e
                    )
                })?
                .to_string_lossy()
                .to_string();

            if !seen.insert(rel_path.clone()) {
                return Err(format!(
                    "Configuration error: file '{}' matches multiple filter globs. Each file must match exactly one filter.",
                    rel_path
                ));
            }

            let metadata = std::fs::metadata(&path)
                .map_err(|e| format!("Cannot read metadata for '{}': {}", path.display(), e))?;
            let mtime = metadata
                .modified()
                .map_err(|e| format!("Cannot read mtime for '{}': {}", path.display(), e))?
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|e| format!("mtime before epoch for '{}': {}", path.display(), e))?
                .as_secs() as i64;

            files.push(DiscoveredFile { rel_path, mtime });
        }
    }
    Ok(files)
}

pub fn count_changes(changes: &[Change]) -> ChangeCounts {
    let mut counts = ChangeCounts::default();
    for change in changes {
        match change {
            Change::CopyToTarget { .. } => counts.copy_to_target += 1,
            Change::CopyToSource { .. } => counts.copy_to_source += 1,
            Change::Conflict { .. } => counts.conflicts += 1,
            Change::DeleteTarget { .. } => counts.delete_target += 1,
            Change::DeleteSource { .. } => counts.delete_source += 1,
            Change::Cleanup { .. } => {} // not shown to user
        }
    }
    counts
}

#[derive(Debug, Default)]
pub struct ChangeCounts {
    pub copy_to_target: usize,
    pub copy_to_source: usize,
    pub conflicts: usize,
    pub delete_target: usize,
    pub delete_source: usize,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::ResolvedFilter;
    use crate::state::FileEntry;

    fn make_filter(glob: &str) -> ResolvedFilter {
        ResolvedFilter {
            glob: glob.to_string(),
            permissions: None,
            owner: None,
        }
    }

    fn make_config(src: &Path, tgt: &Path, state_path: &Path) -> ResolvedConfig {
        ResolvedConfig {
            config_dir: src.parent().unwrap().to_path_buf(),
            source_dir: src.to_path_buf(),
            target_dir: tgt.to_path_buf(),
            filters: vec![make_filter("**/*")],
            state_path: state_path.to_path_buf(),
        }
    }

    #[test]
    fn test_classify_new_source_file() {
        let dir = tempfile::TempDir::new().unwrap();
        let src = dir.path().join("source");
        let tgt = dir.path().join("target");
        std::fs::create_dir(&src).unwrap();
        std::fs::create_dir(&tgt).unwrap();

        std::fs::write(src.join("new.conf"), "content").unwrap();

        let state = State::empty();
        let config = make_config(&src, &tgt, &dir.path().join("state"));

        let changes = classify(&config, &state, false).unwrap();
        assert_eq!(changes.len(), 1);
        assert!(matches!(changes[0], Change::CopyToTarget { .. }));
    }

    #[test]
    fn test_classify_new_target_file() {
        let dir = tempfile::TempDir::new().unwrap();
        let src = dir.path().join("source");
        let tgt = dir.path().join("target");
        std::fs::create_dir(&src).unwrap();
        std::fs::create_dir(&tgt).unwrap();

        std::fs::write(tgt.join("new.conf"), "content").unwrap();

        let state = State::empty();
        let config = make_config(&src, &tgt, &dir.path().join("state"));

        let changes = classify(&config, &state, false).unwrap();
        assert_eq!(changes.len(), 1);
        assert!(matches!(changes[0], Change::CopyToSource { .. }));
    }

    #[test]
    fn test_classify_source_modified() {
        let dir = tempfile::TempDir::new().unwrap();
        let src = dir.path().join("source");
        let tgt = dir.path().join("target");
        std::fs::create_dir(&src).unwrap();
        std::fs::create_dir(&tgt).unwrap();

        let src_file = src.join("app.conf");
        let tgt_file = tgt.join("app.conf");
        std::fs::write(&src_file, "v1").unwrap();
        std::fs::write(&tgt_file, "v1").unwrap();

        // Force both files to have the same explicit mtime
        let sync_time = std::time::UNIX_EPOCH + std::time::Duration::from_secs(1000);
        std::fs::File::open(&src_file)
            .unwrap()
            .set_modified(sync_time)
            .unwrap();
        std::fs::File::open(&tgt_file)
            .unwrap()
            .set_modified(sync_time)
            .unwrap();

        // Modify source and give it a newer mtime
        std::fs::write(&src_file, "v2").unwrap();
        let new_time = std::time::UNIX_EPOCH + std::time::Duration::from_secs(2000);
        std::fs::File::open(&src_file)
            .unwrap()
            .set_modified(new_time)
            .unwrap();

        let state = State {
            last_sync: chrono::Utc::now(),
            file: vec![FileEntry {
                path: "app.conf".to_string(),
                source_mtime: 1000,
                target_mtime: 1000,
            }],
        };
        let config = make_config(&src, &tgt, &dir.path().join("state"));

        let changes = classify(&config, &state, false).unwrap();
        assert_eq!(changes.len(), 1);
        assert!(matches!(changes[0], Change::CopyToTarget { .. }));
    }

    #[test]
    fn test_classify_target_modified() {
        let dir = tempfile::TempDir::new().unwrap();
        let src = dir.path().join("source");
        let tgt = dir.path().join("target");
        std::fs::create_dir(&src).unwrap();
        std::fs::create_dir(&tgt).unwrap();

        let src_file = src.join("app.conf");
        let tgt_file = tgt.join("app.conf");
        std::fs::write(&src_file, "v1").unwrap();
        std::fs::write(&tgt_file, "v1").unwrap();

        let sync_time = std::time::UNIX_EPOCH + std::time::Duration::from_secs(1000);
        std::fs::File::open(&src_file)
            .unwrap()
            .set_modified(sync_time)
            .unwrap();
        std::fs::File::open(&tgt_file)
            .unwrap()
            .set_modified(sync_time)
            .unwrap();

        // Modify target and give it a newer mtime
        std::fs::write(&tgt_file, "v2").unwrap();
        let new_time = std::time::UNIX_EPOCH + std::time::Duration::from_secs(2000);
        std::fs::File::open(&tgt_file)
            .unwrap()
            .set_modified(new_time)
            .unwrap();

        let state = State {
            last_sync: chrono::Utc::now(),
            file: vec![FileEntry {
                path: "app.conf".to_string(),
                source_mtime: 1000,
                target_mtime: 1000,
            }],
        };
        let config = make_config(&src, &tgt, &dir.path().join("state"));

        let changes = classify(&config, &state, false).unwrap();
        assert_eq!(changes.len(), 1);
        assert!(matches!(changes[0], Change::CopyToSource { .. }));
    }

    #[test]
    fn test_classify_conflict_both_modified() {
        let dir = tempfile::TempDir::new().unwrap();
        let src = dir.path().join("source");
        let tgt = dir.path().join("target");
        std::fs::create_dir(&src).unwrap();
        std::fs::create_dir(&tgt).unwrap();

        let src_file = src.join("app.conf");
        let tgt_file = tgt.join("app.conf");
        std::fs::write(&src_file, "v1").unwrap();
        std::fs::write(&tgt_file, "v1").unwrap();

        let sync_time = std::time::UNIX_EPOCH + std::time::Duration::from_secs(1000);
        std::fs::File::open(&src_file)
            .unwrap()
            .set_modified(sync_time)
            .unwrap();
        std::fs::File::open(&tgt_file)
            .unwrap()
            .set_modified(sync_time)
            .unwrap();

        // Modify both and give them different newer mtimes
        std::fs::write(&src_file, "v2_source").unwrap();
        let new_src_time = std::time::UNIX_EPOCH + std::time::Duration::from_secs(2000);
        std::fs::File::open(&src_file)
            .unwrap()
            .set_modified(new_src_time)
            .unwrap();

        std::fs::write(&tgt_file, "v2_target").unwrap();
        let new_tgt_time = std::time::UNIX_EPOCH + std::time::Duration::from_secs(3000);
        std::fs::File::open(&tgt_file)
            .unwrap()
            .set_modified(new_tgt_time)
            .unwrap();

        let state = State {
            last_sync: chrono::Utc::now(),
            file: vec![FileEntry {
                path: "app.conf".to_string(),
                source_mtime: 1000,
                target_mtime: 1000,
            }],
        };
        let config = make_config(&src, &tgt, &dir.path().join("state"));

        let changes = classify(&config, &state, false).unwrap();
        assert_eq!(changes.len(), 1);
        assert!(matches!(changes[0], Change::Conflict { .. }));
    }

    #[test]
    fn test_classify_delete_from_source() {
        let dir = tempfile::TempDir::new().unwrap();
        let src = dir.path().join("source");
        let tgt = dir.path().join("target");
        std::fs::create_dir(&src).unwrap();
        std::fs::create_dir(&tgt).unwrap();

        // File exists only in target (was synced before, now deleted from source)
        std::fs::write(tgt.join("app.conf"), "v1").unwrap();
        let tgt_mtime = unix_timestamp(&tgt.join("app.conf"));

        let state = State {
            last_sync: chrono::Utc::now(),
            file: vec![FileEntry {
                path: "app.conf".to_string(),
                source_mtime: tgt_mtime,
                target_mtime: tgt_mtime,
            }],
        };
        let config = make_config(&src, &tgt, &dir.path().join("state"));

        let changes = classify(&config, &state, false).unwrap();
        assert_eq!(changes.len(), 1);
        assert!(matches!(changes[0], Change::DeleteTarget { .. }));
    }

    #[test]
    fn test_classify_delete_from_target() {
        let dir = tempfile::TempDir::new().unwrap();
        let src = dir.path().join("source");
        let tgt = dir.path().join("target");
        std::fs::create_dir(&src).unwrap();
        std::fs::create_dir(&tgt).unwrap();

        std::fs::write(src.join("app.conf"), "v1").unwrap();
        let src_mtime = unix_timestamp(&src.join("app.conf"));

        let state = State {
            last_sync: chrono::Utc::now(),
            file: vec![FileEntry {
                path: "app.conf".to_string(),
                source_mtime: src_mtime,
                target_mtime: src_mtime,
            }],
        };
        let config = make_config(&src, &tgt, &dir.path().join("state"));

        let changes = classify(&config, &state, false).unwrap();
        assert_eq!(changes.len(), 1);
        assert!(matches!(changes[0], Change::DeleteSource { .. }));
    }

    #[test]
    fn test_classify_cleanup() {
        let dir = tempfile::TempDir::new().unwrap();
        let src = dir.path().join("source");
        let tgt = dir.path().join("target");
        std::fs::create_dir(&src).unwrap();
        std::fs::create_dir(&tgt).unwrap();

        let state = State {
            last_sync: chrono::Utc::now(),
            file: vec![FileEntry {
                path: "old.conf".to_string(),
                source_mtime: 100,
                target_mtime: 100,
            }],
        };
        let config = make_config(&src, &tgt, &dir.path().join("state"));

        let changes = classify(&config, &state, false).unwrap();
        assert_eq!(changes.len(), 1);
        assert!(matches!(changes[0], Change::Cleanup { .. }));
    }

    #[test]
    fn test_classify_unchanged() {
        let dir = tempfile::TempDir::new().unwrap();
        let src = dir.path().join("source");
        let tgt = dir.path().join("target");
        std::fs::create_dir(&src).unwrap();
        std::fs::create_dir(&tgt).unwrap();

        let src_file = src.join("app.conf");
        let tgt_file = tgt.join("app.conf");
        std::fs::write(&src_file, "content").unwrap();
        std::fs::write(&tgt_file, "content").unwrap();

        let sync_time = std::fs::metadata(&src_file).unwrap().modified().unwrap();
        std::fs::File::open(&tgt_file)
            .unwrap()
            .set_modified(sync_time)
            .unwrap();
        let mtime = unix_timestamp(&src_file);

        let state = State {
            last_sync: chrono::Utc::now(),
            file: vec![FileEntry {
                path: "app.conf".to_string(),
                source_mtime: mtime,
                target_mtime: mtime,
            }],
        };
        let config = make_config(&src, &tgt, &dir.path().join("state"));

        let changes = classify(&config, &state, false).unwrap();
        assert!(changes.is_empty());
    }

    #[test]
    fn test_filter_respects_glob() {
        let dir = tempfile::TempDir::new().unwrap();
        let src = dir.path().join("source");
        let tgt = dir.path().join("target");
        std::fs::create_dir(&src).unwrap();
        std::fs::create_dir(&tgt).unwrap();

        std::fs::write(src.join("app.conf"), "content").unwrap();
        std::fs::write(src.join("readme.txt"), "text").unwrap();

        let mut config = make_config(&src, &tgt, &dir.path().join("state"));
        config.filters = vec![make_filter("*.conf")];

        let state = State::empty();
        let changes = classify(&config, &state, false).unwrap();

        // Only app.conf should be picked up
        assert_eq!(changes.len(), 1);
        let Change::CopyToTarget { ref rel_path, .. } = changes[0] else {
            panic!("expected CopyToTarget");
        };
        assert_eq!(rel_path, "app.conf");
    }

    fn unix_timestamp(path: &Path) -> i64 {
        std::fs::metadata(path)
            .unwrap()
            .modified()
            .unwrap()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64
    }
}
