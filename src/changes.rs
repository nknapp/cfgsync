use crate::config::{ResolvedConfig, ResolvedGlob};
use crate::state::State;
use std::collections::{BTreeSet, HashMap, HashSet};
use std::path::{Path, PathBuf};

#[derive(Debug)]
pub struct DiscoveredFile {
    pub rel_path: String,
    pub mtime: i64,
}

#[derive(Debug, PartialEq)]
pub enum Change {
    CopyToTarget {
        group_index: usize,
        rel_path: String,
        abs_src: PathBuf,
        abs_tgt: PathBuf,
    },
    CopyToSource {
        group_index: usize,
        rel_path: String,
        abs_src: PathBuf,
        abs_tgt: PathBuf,
    },
    Conflict {
        group_index: usize,
        rel_path: String,
        abs_src: PathBuf,
        abs_tgt: PathBuf,
    },
    DeleteTarget {
        group_index: usize,
        rel_path: String,
        abs_tgt: PathBuf,
    },
    DeleteSource {
        group_index: usize,
        rel_path: String,
        abs_src: PathBuf,
    },
    Cleanup {
        group_index: usize,
        rel_path: String,
    },
}

pub fn classify(
    config: &ResolvedConfig,
    state: &State,
    verbose: bool,
    debug: bool,
) -> Result<Vec<Change>, String> {
    let mut group_source_files: Vec<Vec<DiscoveredFile>> = Vec::new();
    let mut group_target_files: Vec<Vec<DiscoveredFile>> = Vec::new();
    let mut total_source = 0usize;
    let mut total_target = 0usize;

    for group in config.sync_groups.iter() {
        let src_files = scan_dir(&group.source_dir, &group.globs, debug)?;
        let tgt_files = scan_dir(&group.target_dir, &group.globs, debug)?;
        total_source += src_files.len();
        total_target += tgt_files.len();
        group_source_files.push(src_files);
        group_target_files.push(tgt_files);
    }

    if verbose {
        eprintln!(
            "files visited: {} (source) + {} (target) = {} total",
            total_source,
            total_target,
            total_source + total_target
        );
    }

    // Cross-group overlap validation (based on absolute paths)
    let mut path_to_group: HashMap<PathBuf, usize> = HashMap::new();
    for (i, src_files) in group_source_files.iter().enumerate() {
        for f in src_files {
            let abs_path = config.sync_groups[i].source_dir.join(&f.rel_path);
            if let Some(&existing_group) = path_to_group.get(&abs_path)
                && existing_group != i
            {
                return Err(format!(
                    "File '{}' matches globs in both sync group {} and sync group {}. Each file must belong to exactly one group.",
                    f.rel_path,
                    existing_group + 1,
                    i + 1
                ));
            }
            path_to_group.insert(abs_path, i);
        }
    }
    for (i, tgt_files) in group_target_files.iter().enumerate() {
        for f in tgt_files {
            let abs_path = config.sync_groups[i].target_dir.join(&f.rel_path);
            if let Some(&existing_group) = path_to_group.get(&abs_path)
                && existing_group != i
            {
                return Err(format!(
                    "File '{}' matches globs in both sync group {} and sync group {}. Each file must belong to exactly one group.",
                    f.rel_path,
                    existing_group + 1,
                    i + 1
                ));
            }
            path_to_group.insert(abs_path, i);
        }
    }

    let state_map = state.as_map();

    // Collect all unique paths across all groups
    let mut all_paths: BTreeSet<(usize, &str)> = BTreeSet::new();
    for (i, src_files) in group_source_files.iter().enumerate() {
        for f in src_files {
            all_paths.insert((i, &f.rel_path));
        }
    }
    for (i, tgt_files) in group_target_files.iter().enumerate() {
        for f in tgt_files {
            all_paths.insert((i, &f.rel_path));
        }
    }
    for &(group_index, path) in state_map.keys() {
        all_paths.insert((group_index, path));
    }

    let mut changes = Vec::new();

    for (group_index, rel_path) in all_paths {
        let group = &config.sync_groups[group_index];
        let in_source = group_source_files[group_index]
            .iter()
            .find(|f| f.rel_path == rel_path);
        let in_target = group_target_files[group_index]
            .iter()
            .find(|f| f.rel_path == rel_path);
        let in_state = state_map.get(&(group_index, rel_path));
        let abs_src = group.source_dir.join(rel_path);
        let abs_tgt = group.target_dir.join(rel_path);

        match (in_source, in_target, in_state) {
            (Some(s), Some(t), Some(state_entry)) => {
                let src_mod = s.mtime != state_entry.source_mtime;
                let tgt_mod = t.mtime != state_entry.target_mtime;
                if src_mod && tgt_mod {
                    if !files_identical(&abs_src, &abs_tgt) {
                        changes.push(Change::Conflict {
                            group_index,
                            rel_path: rel_path.to_string(),
                            abs_src,
                            abs_tgt,
                        });
                    }
                } else if src_mod {
                    changes.push(Change::CopyToTarget {
                        group_index,
                        rel_path: rel_path.to_string(),
                        abs_src,
                        abs_tgt,
                    });
                } else if tgt_mod {
                    changes.push(Change::CopyToSource {
                        group_index,
                        rel_path: rel_path.to_string(),
                        abs_src,
                        abs_tgt,
                    });
                }
            }

            (Some(_), None, None) => {
                changes.push(Change::CopyToTarget {
                    group_index,
                    rel_path: rel_path.to_string(),
                    abs_src,
                    abs_tgt,
                });
            }

            (None, Some(_), None) => {
                changes.push(Change::CopyToSource {
                    group_index,
                    rel_path: rel_path.to_string(),
                    abs_src,
                    abs_tgt,
                });
            }

            (Some(_), None, Some(_)) => {
                changes.push(Change::DeleteSource {
                    group_index,
                    rel_path: rel_path.to_string(),
                    abs_src,
                });
            }

            (None, Some(_), Some(_)) => {
                changes.push(Change::DeleteTarget {
                    group_index,
                    rel_path: rel_path.to_string(),
                    abs_tgt,
                });
            }

            (None, None, Some(_)) => {
                changes.push(Change::Cleanup {
                    group_index,
                    rel_path: rel_path.to_string(),
                });
            }

            (Some(_), Some(_), None) => {
                if !files_identical(&abs_src, &abs_tgt) {
                    changes.push(Change::Conflict {
                        group_index,
                        rel_path: rel_path.to_string(),
                        abs_src,
                        abs_tgt,
                    });
                }
            }

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

fn scan_dir(
    dir: &Path,
    globs: &[ResolvedGlob],
    debug: bool,
) -> Result<Vec<DiscoveredFile>, String> {
    let mut files = Vec::new();
    let mut seen = HashSet::new();

    for glob_entry in globs {
        let pattern_str = dir.join(&glob_entry.pattern).to_string_lossy().to_string();

        if debug {
            eprintln!(
                "[debug] scanning {} with pattern '{}'",
                dir.display(),
                pattern_str
            );
        }

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

            if debug {
                eprintln!("[debug]   found {}", path.display());
            }

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
                    "Configuration error: file '{}' matches multiple globs in the same group. Each file must match exactly one glob.",
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
            Change::Cleanup { .. } => {}
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
    use crate::config::ResolvedGlob;
    use crate::state::FileEntry;

    fn make_glob(pattern: &str) -> ResolvedGlob {
        ResolvedGlob {
            pattern: pattern.to_string(),
            permissions: None,
            owner: None,
        }
    }

    fn make_config(groups: Vec<(PathBuf, PathBuf, &Path)>, state_path: &Path) -> ResolvedConfig {
        ResolvedConfig {
            config_dir: groups[0].0.parent().unwrap().to_path_buf(),
            config_path: state_path.with_extension("toml"),
            sync_groups: groups
                .into_iter()
                .map(|(src, tgt, _)| crate::config::ResolvedSyncGroup {
                    source_dir: src,
                    target_dir: tgt,
                    globs: vec![make_glob("**/*")],
                    permissions: None,
                    owner: None,
                })
                .collect(),
            state_path: state_path.to_path_buf(),
        }
    }

    fn make_single_config(src: &Path, tgt: &Path, state_path: &Path) -> ResolvedConfig {
        make_config(
            vec![(src.to_path_buf(), tgt.to_path_buf(), src)],
            state_path,
        )
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
        let config = make_single_config(&src, &tgt, &dir.path().join("state"));

        let changes = classify(&config, &state, false, false).unwrap();
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
        let config = make_single_config(&src, &tgt, &dir.path().join("state"));

        let changes = classify(&config, &state, false, false).unwrap();
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

        let sync_time = std::time::UNIX_EPOCH + std::time::Duration::from_secs(1000);
        std::fs::File::open(&src_file)
            .unwrap()
            .set_modified(sync_time)
            .unwrap();
        std::fs::File::open(&tgt_file)
            .unwrap()
            .set_modified(sync_time)
            .unwrap();

        std::fs::write(&src_file, "v2").unwrap();
        let new_time = std::time::UNIX_EPOCH + std::time::Duration::from_secs(2000);
        std::fs::File::open(&src_file)
            .unwrap()
            .set_modified(new_time)
            .unwrap();

        let state = State {
            last_sync: chrono::Utc::now(),
            file: vec![FileEntry {
                group_index: 0,
                path: "app.conf".to_string(),
                source_mtime: 1000,
                target_mtime: 1000,
            }],
        };
        let config = make_single_config(&src, &tgt, &dir.path().join("state"));

        let changes = classify(&config, &state, false, false).unwrap();
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

        std::fs::write(&tgt_file, "v2").unwrap();
        let new_time = std::time::UNIX_EPOCH + std::time::Duration::from_secs(2000);
        std::fs::File::open(&tgt_file)
            .unwrap()
            .set_modified(new_time)
            .unwrap();

        let state = State {
            last_sync: chrono::Utc::now(),
            file: vec![FileEntry {
                group_index: 0,
                path: "app.conf".to_string(),
                source_mtime: 1000,
                target_mtime: 1000,
            }],
        };
        let config = make_single_config(&src, &tgt, &dir.path().join("state"));

        let changes = classify(&config, &state, false, false).unwrap();
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
                group_index: 0,
                path: "app.conf".to_string(),
                source_mtime: 1000,
                target_mtime: 1000,
            }],
        };
        let config = make_single_config(&src, &tgt, &dir.path().join("state"));

        let changes = classify(&config, &state, false, false).unwrap();
        assert_eq!(changes.len(), 1);
        let change = &changes[0];
        assert!(matches!(change, Change::Conflict { .. }));
        if let Change::Conflict {
            abs_src, abs_tgt, ..
        } = change
        {
            assert!(abs_src.ends_with("app.conf"));
            assert!(abs_tgt.ends_with("app.conf"));
        }
    }

    #[test]
    fn test_classify_delete_from_source() {
        let dir = tempfile::TempDir::new().unwrap();
        let src = dir.path().join("source");
        let tgt = dir.path().join("target");
        std::fs::create_dir(&src).unwrap();
        std::fs::create_dir(&tgt).unwrap();

        std::fs::write(tgt.join("app.conf"), "v1").unwrap();
        let tgt_mtime = unix_timestamp(&tgt.join("app.conf"));

        let state = State {
            last_sync: chrono::Utc::now(),
            file: vec![FileEntry {
                group_index: 0,
                path: "app.conf".to_string(),
                source_mtime: tgt_mtime,
                target_mtime: tgt_mtime,
            }],
        };
        let config = make_single_config(&src, &tgt, &dir.path().join("state"));

        let changes = classify(&config, &state, false, false).unwrap();
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
                group_index: 0,
                path: "app.conf".to_string(),
                source_mtime: src_mtime,
                target_mtime: src_mtime,
            }],
        };
        let config = make_single_config(&src, &tgt, &dir.path().join("state"));

        let changes = classify(&config, &state, false, false).unwrap();
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
                group_index: 0,
                path: "old.conf".to_string(),
                source_mtime: 100,
                target_mtime: 100,
            }],
        };
        let config = make_single_config(&src, &tgt, &dir.path().join("state"));

        let changes = classify(&config, &state, false, false).unwrap();
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
                group_index: 0,
                path: "app.conf".to_string(),
                source_mtime: mtime,
                target_mtime: mtime,
            }],
        };
        let config = make_single_config(&src, &tgt, &dir.path().join("state"));

        let changes = classify(&config, &state, false, false).unwrap();
        assert!(changes.is_empty());
    }

    #[test]
    fn test_glob_respects_glob() {
        let dir = tempfile::TempDir::new().unwrap();
        let src = dir.path().join("source");
        let tgt = dir.path().join("target");
        std::fs::create_dir(&src).unwrap();
        std::fs::create_dir(&tgt).unwrap();

        std::fs::write(src.join("app.conf"), "content").unwrap();
        std::fs::write(src.join("readme.txt"), "text").unwrap();

        let mut config = make_single_config(&src, &tgt, &dir.path().join("state"));
        config.sync_groups[0].globs = vec![make_glob("*.conf")];

        let state = State::empty();
        let changes = classify(&config, &state, false, false).unwrap();

        assert_eq!(changes.len(), 1);
        let Change::CopyToTarget { ref rel_path, .. } = changes[0] else {
            panic!("expected CopyToTarget");
        };
        assert_eq!(rel_path, "app.conf");
    }

    #[test]
    fn test_classify_overlapping_groups_error() {
        let dir = tempfile::TempDir::new().unwrap();
        let src = dir.path().join("source");
        let tgt1 = dir.path().join("target1");
        let tgt2 = dir.path().join("target2");
        std::fs::create_dir(&src).unwrap();
        std::fs::create_dir(&tgt1).unwrap();
        std::fs::create_dir(&tgt2).unwrap();

        std::fs::write(src.join("shared.conf"), "content").unwrap();

        let config = ResolvedConfig {
            config_dir: dir.path().to_path_buf(),
            config_path: dir.path().join("state").with_extension("toml"),
            sync_groups: vec![
                crate::config::ResolvedSyncGroup {
                    source_dir: src.clone(),
                    target_dir: tgt1,
                    globs: vec![make_glob("**/*")],
                    permissions: None,
                    owner: None,
                },
                crate::config::ResolvedSyncGroup {
                    source_dir: src,
                    target_dir: tgt2,
                    globs: vec![make_glob("**/*")],
                    permissions: None,
                    owner: None,
                },
            ],
            state_path: dir.path().join("state"),
        };

        let state = State::empty();
        let result = classify(&config, &state, false, false);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(
            err.contains("matches globs in both sync group"),
            "got: {}",
            err
        );
    }

    #[test]
    fn test_classify_multiple_groups_independent() {
        let dir = tempfile::TempDir::new().unwrap();
        let src1 = dir.path().join("source1");
        let tgt1 = dir.path().join("target1");
        let src2 = dir.path().join("source2");
        let tgt2 = dir.path().join("target2");
        std::fs::create_dir(&src1).unwrap();
        std::fs::create_dir(&tgt1).unwrap();
        std::fs::create_dir(&src2).unwrap();
        std::fs::create_dir(&tgt2).unwrap();

        std::fs::write(src1.join("file1.conf"), "a").unwrap();
        std::fs::write(src2.join("file2.conf"), "b").unwrap();

        let config = ResolvedConfig {
            config_dir: dir.path().to_path_buf(),
            config_path: dir.path().join("state").with_extension("toml"),
            sync_groups: vec![
                crate::config::ResolvedSyncGroup {
                    source_dir: src1,
                    target_dir: tgt1,
                    globs: vec![make_glob("file1.*")],
                    permissions: None,
                    owner: None,
                },
                crate::config::ResolvedSyncGroup {
                    source_dir: src2,
                    target_dir: tgt2,
                    globs: vec![make_glob("file2.*")],
                    permissions: None,
                    owner: None,
                },
            ],
            state_path: dir.path().join("state"),
        };

        let state = State::empty();
        let changes = classify(&config, &state, false, false).unwrap();
        assert_eq!(changes.len(), 2);
        assert!(
            changes
                .iter()
                .any(|c| matches!(c, Change::CopyToTarget { group_index: 0, .. }))
        );
        assert!(
            changes
                .iter()
                .any(|c| matches!(c, Change::CopyToTarget { group_index: 1, .. }))
        );
    }

    #[test]
    fn test_classify_group_with_zero_matching_files() {
        let dir = tempfile::TempDir::new().unwrap();
        let src = dir.path().join("source");
        let tgt = dir.path().join("target");
        std::fs::create_dir(&src).unwrap();
        std::fs::create_dir(&tgt).unwrap();

        std::fs::write(src.join("file.txt"), "content").unwrap();

        let config = ResolvedConfig {
            config_dir: dir.path().to_path_buf(),
            config_path: dir.path().join("state").with_extension("toml"),
            sync_groups: vec![
                crate::config::ResolvedSyncGroup {
                    source_dir: src.clone(),
                    target_dir: tgt.clone(),
                    globs: vec![make_glob("**/*.txt")],
                    permissions: None,
                    owner: None,
                },
                crate::config::ResolvedSyncGroup {
                    source_dir: src.clone(),
                    target_dir: tgt.clone(),
                    globs: vec![make_glob("*.nothing")],
                    permissions: None,
                    owner: None,
                },
            ],
            state_path: dir.path().join("state"),
        };

        let state = State::empty();
        let changes = classify(&config, &state, false, false).unwrap();
        // Only group 0 matches; group 1 has zero files
        assert_eq!(changes.len(), 1);
        assert!(matches!(
            changes[0],
            Change::CopyToTarget { group_index: 0, .. }
        ));
    }

    #[test]
    fn test_classify_multi_group_same_dir_non_overlapping_globs() {
        let dir = tempfile::TempDir::new().unwrap();
        let src = dir.path().join("source");
        let tgt = dir.path().join("target");
        std::fs::create_dir(&src).unwrap();
        std::fs::create_dir(&tgt).unwrap();

        std::fs::write(src.join("app.conf"), "conf").unwrap();
        std::fs::write(src.join("readme.txt"), "txt").unwrap();

        let config = ResolvedConfig {
            config_dir: dir.path().to_path_buf(),
            config_path: dir.path().join("state").with_extension("toml"),
            sync_groups: vec![
                crate::config::ResolvedSyncGroup {
                    source_dir: src.clone(),
                    target_dir: tgt.clone(),
                    globs: vec![make_glob("*.conf")],
                    permissions: None,
                    owner: None,
                },
                crate::config::ResolvedSyncGroup {
                    source_dir: src.clone(),
                    target_dir: tgt.clone(),
                    globs: vec![make_glob("*.txt")],
                    permissions: None,
                    owner: None,
                },
            ],
            state_path: dir.path().join("state"),
        };

        let state = State::empty();
        let changes = classify(&config, &state, false, false).unwrap();
        assert_eq!(changes.len(), 2);
        assert!(
            changes
                .iter()
                .any(|c| matches!(c, Change::CopyToTarget { group_index: 0, .. }))
        );
        assert!(
            changes
                .iter()
                .any(|c| matches!(c, Change::CopyToTarget { group_index: 1, .. }))
        );
    }

    #[test]
    fn test_classify_cleanup_across_multiple_groups() {
        let dir = tempfile::TempDir::new().unwrap();
        let src1 = dir.path().join("source1");
        let tgt1 = dir.path().join("target1");
        let src2 = dir.path().join("source2");
        let tgt2 = dir.path().join("target2");
        std::fs::create_dir(&src1).unwrap();
        std::fs::create_dir(&tgt1).unwrap();
        std::fs::create_dir(&src2).unwrap();
        std::fs::create_dir(&tgt2).unwrap();

        // Both files are gone but still tracked in state — should produce Cleanup for each group
        let state = State {
            last_sync: chrono::Utc::now(),
            file: vec![
                FileEntry {
                    group_index: 0,
                    path: "gone1.conf".to_string(),
                    source_mtime: 100,
                    target_mtime: 100,
                },
                FileEntry {
                    group_index: 1,
                    path: "gone2.conf".to_string(),
                    source_mtime: 200,
                    target_mtime: 200,
                },
            ],
        };
        let config = ResolvedConfig {
            config_dir: dir.path().to_path_buf(),
            config_path: dir.path().join("state").with_extension("toml"),
            sync_groups: vec![
                crate::config::ResolvedSyncGroup {
                    source_dir: src1,
                    target_dir: tgt1,
                    globs: vec![make_glob("**/*")],
                    permissions: None,
                    owner: None,
                },
                crate::config::ResolvedSyncGroup {
                    source_dir: src2,
                    target_dir: tgt2,
                    globs: vec![make_glob("**/*")],
                    permissions: None,
                    owner: None,
                },
            ],
            state_path: dir.path().join("state"),
        };

        let changes = classify(&config, &state, false, false).unwrap();
        assert_eq!(changes.len(), 2);
        assert!(
            changes
                .iter()
                .any(|c| matches!(c, Change::Cleanup { group_index: 0, .. }))
        );
        assert!(
            changes
                .iter()
                .any(|c| matches!(c, Change::Cleanup { group_index: 1, .. }))
        );
    }

    #[test]
    fn test_classify_conflict_variant_has_abs_paths() {
        let dir = tempfile::TempDir::new().unwrap();
        let src = dir.path().join("source");
        let tgt = dir.path().join("target");
        std::fs::create_dir(&src).unwrap();
        std::fs::create_dir(&tgt).unwrap();

        std::fs::write(src.join("conflict.txt"), "v1").unwrap();
        std::fs::write(tgt.join("conflict.txt"), "v2").unwrap();

        let config = make_single_config(&src, &tgt, &dir.path().join("state"));
        let state = State::empty();
        let changes = classify(&config, &state, false, false).unwrap();
        assert_eq!(changes.len(), 1);

        if let Change::Conflict {
            abs_src, abs_tgt, ..
        } = &changes[0]
        {
            assert!(
                abs_src.ends_with("conflict.txt"),
                "abs_src ends with conflict.txt"
            );
            assert!(
                abs_tgt.ends_with("conflict.txt"),
                "abs_tgt ends with conflict.txt"
            );
            assert!(!abs_src.to_string_lossy().is_empty());
            assert!(!abs_tgt.to_string_lossy().is_empty());
        } else {
            panic!("expected Conflict variant");
        }
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
