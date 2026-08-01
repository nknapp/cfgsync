use crate::config::{ResolvedConfig, ResolvedGlob};
use crate::state::{FileEntry, State};
use chrono::DateTime;
use std::collections::{BTreeSet, HashMap, HashSet};
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

#[derive(Debug)]
pub struct DiscoveredFile {
    pub rel_path: String,
    pub mtime: i64,
    pub is_symlink: bool,
    pub symlink_target: Option<String>,
}

#[derive(Debug, PartialEq, Clone)]
pub enum Change {
    CopyToTarget {
        group_index: usize,
        rel_path: String,
        abs_src: PathBuf,
        abs_tgt: PathBuf,
        failed_checks: Vec<String>,
    },
    CopyToSource {
        group_index: usize,
        rel_path: String,
        abs_src: PathBuf,
        abs_tgt: PathBuf,
        failed_checks: Vec<String>,
    },
    Conflict {
        group_index: usize,
        rel_path: String,
        abs_src: PathBuf,
        abs_tgt: PathBuf,
        failed_checks: Vec<String>,
    },
    DeleteTarget {
        group_index: usize,
        rel_path: String,
        abs_tgt: PathBuf,
        failed_checks: Vec<String>,
    },
    DeleteSource {
        group_index: usize,
        rel_path: String,
        abs_src: PathBuf,
        failed_checks: Vec<String>,
    },
    DeleteFromState {
        group_index: usize,
        rel_path: String,
        failed_checks: Vec<String>,
    },
    UpdateState {
        group_index: usize,
        rel_path: String,
        failed_checks: Vec<String>,
    },
    Clean {
        group_index: usize,
        rel_path: String,
        failed_checks: Vec<String>,
    },
    #[allow(dead_code)]
    Failed {
        group_index: usize,
        rel_path: String,
        reason: String,
    },
}

impl Change {
    #[allow(dead_code)]
    pub fn group_index(&self) -> usize {
        match self {
            Change::CopyToTarget { group_index, .. }
            | Change::CopyToSource { group_index, .. }
            | Change::Conflict { group_index, .. }
            | Change::DeleteTarget { group_index, .. }
            | Change::DeleteSource { group_index, .. }
            | Change::DeleteFromState { group_index, .. }
            | Change::UpdateState { group_index, .. }
            | Change::Clean { group_index, .. }
            | Change::Failed { group_index, .. } => *group_index,
        }
    }

    #[allow(dead_code)]
    pub fn rel_path(&self) -> &str {
        match self {
            Change::CopyToTarget { rel_path, .. }
            | Change::CopyToSource { rel_path, .. }
            | Change::Conflict { rel_path, .. }
            | Change::DeleteTarget { rel_path, .. }
            | Change::DeleteSource { rel_path, .. }
            | Change::DeleteFromState { rel_path, .. }
            | Change::UpdateState { rel_path, .. }
            | Change::Clean { rel_path, .. }
            | Change::Failed { rel_path, .. } => rel_path,
        }
    }

    pub fn failed_checks(&self) -> &[String] {
        match self {
            Change::CopyToTarget { failed_checks, .. }
            | Change::CopyToSource { failed_checks, .. }
            | Change::Conflict { failed_checks, .. }
            | Change::DeleteTarget { failed_checks, .. }
            | Change::DeleteSource { failed_checks, .. }
            | Change::DeleteFromState { failed_checks, .. }
            | Change::UpdateState { failed_checks, .. }
            | Change::Clean { failed_checks, .. } => failed_checks,
            Change::Failed { .. } => &[],
        }
    }
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

    validate_group_overlap(config, &group_source_files, &group_target_files)?;

    let state_map = state.as_map();

    let group_to_index: HashMap<String, usize> = config
        .sync_groups
        .iter()
        .enumerate()
        .map(|(i, g)| (g.target_dir.to_string_lossy().to_string(), i))
        .collect();

    let mut all_paths: BTreeSet<(String, String)> = BTreeSet::new();
    for (i, src_files) in group_source_files.iter().enumerate() {
        let group_path = config.sync_groups[i]
            .target_dir
            .to_string_lossy()
            .to_string();
        for f in src_files {
            all_paths.insert((group_path.clone(), f.rel_path.clone()));
        }
    }
    for (i, tgt_files) in group_target_files.iter().enumerate() {
        let group_path = config.sync_groups[i]
            .target_dir
            .to_string_lossy()
            .to_string();
        for f in tgt_files {
            all_paths.insert((group_path.clone(), f.rel_path.clone()));
        }
    }
    for &(group_path, path) in state_map.keys() {
        all_paths.insert((group_path.to_string(), path.to_string()));
    }

    let mut changes = Vec::new();

    for (group_path, rel_path) in all_paths {
        let group_index = match group_to_index.get(group_path.as_str()) {
            Some(&i) => i,
            None => continue,
        };
        let group = &config.sync_groups[group_index];
        let in_source = group_source_files[group_index]
            .iter()
            .find(|f| f.rel_path == rel_path);
        let in_target = group_target_files[group_index]
            .iter()
            .find(|f| f.rel_path == rel_path);
        let in_state = state_map.get(&(group_path.as_str(), rel_path.as_str()));
        let abs_src = group.source_dir.join(&rel_path);
        let abs_tgt = group.target_dir.join(&rel_path);

        let change = classify_entry(
            in_source,
            in_target,
            in_state,
            group_index,
            &rel_path,
            &abs_src,
            &abs_tgt,
            &group.globs,
            &group.source_dir,
        );
        changes.push(change);
    }

    Ok(changes)
}

fn validate_group_overlap(
    config: &ResolvedConfig,
    group_source_files: &[Vec<DiscoveredFile>],
    group_target_files: &[Vec<DiscoveredFile>],
) -> Result<(), String> {
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
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn classify_entry(
    in_source: Option<&DiscoveredFile>,
    in_target: Option<&DiscoveredFile>,
    in_state: Option<&&FileEntry>,
    group_index: usize,
    rel_path: &str,
    abs_src: &Path,
    abs_tgt: &Path,
    globs: &[ResolvedGlob],
    source_dir: &Path,
) -> Change {
    let rel = rel_path.to_string();
    let gi = group_index;
    let src = abs_src.to_path_buf();
    let tgt = abs_tgt.to_path_buf();

    match in_state {
        None => match (in_source, in_target) {
            (Some(_s), Some(_t)) => {
                if _s.is_symlink != _t.is_symlink {
                    Change::Conflict {
                        group_index: gi,
                        rel_path: rel,
                        abs_src: src.clone(),
                        abs_tgt: tgt.clone(),
                        failed_checks: Vec::new(),
                    }
                } else {
                    let src_hash =
                        compute_file_hash(abs_src, _s.is_symlink, _s.symlink_target.as_deref());
                    let tgt_hash =
                        compute_file_hash(abs_tgt, _t.is_symlink, _t.symlink_target.as_deref());
                    let perms_equal =
                        source_configured_perms_match_target(abs_src, abs_tgt, globs, source_dir);
                    let owner_equal =
                        source_configured_owner_matches_target(abs_src, abs_tgt, globs, source_dir);
                    if src_hash.is_some() && src_hash == tgt_hash && perms_equal && owner_equal {
                        Change::UpdateState {
                            group_index: gi,
                            rel_path: rel,
                            failed_checks: Vec::new(),
                        }
                    } else {
                        Change::Conflict {
                            group_index: gi,
                            rel_path: rel,
                            abs_src: src.clone(),
                            abs_tgt: tgt.clone(),
                            failed_checks: Vec::new(),
                        }
                    }
                }
            }
            (Some(_), None) => Change::CopyToTarget {
                group_index: gi,
                rel_path: rel,
                abs_src: src.clone(),
                abs_tgt: tgt.clone(),
                failed_checks: Vec::new(),
            },
            (None, Some(_)) => Change::CopyToSource {
                group_index: gi,
                rel_path: rel,
                abs_src: src.clone(),
                abs_tgt: tgt.clone(),
                failed_checks: Vec::new(),
            },
            (None, None) => Change::Clean {
                group_index: gi,
                rel_path: rel,
                failed_checks: Vec::new(),
            },
        },

        Some(state_entry) => match (in_source, in_target) {
            (None, None) => Change::DeleteFromState {
                group_index: gi,
                rel_path: rel,
                failed_checks: Vec::new(),
            },

            (None, Some(target)) => {
                if is_changed(target, abs_tgt, state_entry) {
                    Change::Conflict {
                        group_index: gi,
                        rel_path: rel,
                        abs_src: src.clone(),
                        abs_tgt: tgt.clone(),
                        failed_checks: Vec::new(),
                    }
                } else {
                    Change::DeleteTarget {
                        group_index: gi,
                        rel_path: rel,
                        abs_tgt: tgt.clone(),
                        failed_checks: Vec::new(),
                    }
                }
            }

            (Some(source), None) => {
                if is_changed(source, abs_src, state_entry) {
                    Change::Conflict {
                        group_index: gi,
                        rel_path: rel,
                        abs_src: src.clone(),
                        abs_tgt: tgt.clone(),
                        failed_checks: Vec::new(),
                    }
                } else {
                    Change::DeleteSource {
                        group_index: gi,
                        rel_path: rel,
                        abs_src: src.clone(),
                        failed_checks: Vec::new(),
                    }
                }
            }

            (Some(source), Some(target)) => {
                let src_changed = is_changed(source, abs_src, state_entry);
                let tgt_changed = is_changed(target, abs_tgt, state_entry);

                if !src_changed && !tgt_changed {
                    if target_permissions_differ(
                        rel_path,
                        abs_tgt,
                        state_entry,
                        abs_src,
                        globs,
                        source_dir,
                    ) {
                        Change::CopyToTarget {
                            group_index: gi,
                            rel_path: rel,
                            abs_src: src.clone(),
                            abs_tgt: tgt.clone(),
                            failed_checks: Vec::new(),
                        }
                    } else {
                        Change::Clean {
                            group_index: gi,
                            rel_path: rel,
                            failed_checks: Vec::new(),
                        }
                    }
                } else if src_changed && !tgt_changed {
                    Change::CopyToTarget {
                        group_index: gi,
                        rel_path: rel,
                        abs_src: src.clone(),
                        abs_tgt: tgt.clone(),
                        failed_checks: Vec::new(),
                    }
                } else if !src_changed && tgt_changed {
                    Change::CopyToSource {
                        group_index: gi,
                        rel_path: rel,
                        abs_src: src.clone(),
                        abs_tgt: tgt.clone(),
                        failed_checks: Vec::new(),
                    }
                } else if files_or_symlinks_identical(
                    abs_src,
                    abs_tgt,
                    source.is_symlink,
                    target.is_symlink,
                ) {
                    Change::UpdateState {
                        group_index: gi,
                        rel_path: rel,
                        failed_checks: Vec::new(),
                    }
                } else {
                    Change::Conflict {
                        group_index: gi,
                        rel_path: rel,
                        abs_src: src.clone(),
                        abs_tgt: tgt.clone(),
                        failed_checks: Vec::new(),
                    }
                }
            }
        },
    }
}

fn parse_mtime_to_i64(mtime_str: &str) -> Option<i64> {
    DateTime::parse_from_rfc3339(mtime_str)
        .ok()
        .map(|dt| dt.timestamp_millis())
}

fn is_changed(file: &DiscoveredFile, abs_path: &Path, state_entry: &FileEntry) -> bool {
    let file_type_str = if file.is_symlink { "symlink" } else { "file" };
    if state_entry.file_type != file_type_str {
        return true;
    }

    let state_mtime = parse_mtime_to_i64(&state_entry.mtime).unwrap_or(0);
    if file.mtime == state_mtime {
        return false;
    }

    let file_hash = compute_file_hash(abs_path, file.is_symlink, file.symlink_target.as_deref());
    let Some(file_hash) = file_hash else {
        return true;
    };

    if file_hash != state_entry.hash {
        return true;
    }

    perms_differ_from_state(abs_path, state_entry)
        || owner_differs_from_state(abs_path, state_entry)
}

fn perms_differ_from_state(abs_path: &Path, state_entry: &FileEntry) -> bool {
    let Ok(metadata) = std::fs::symlink_metadata(abs_path) else {
        return true;
    };
    if metadata.file_type().is_symlink() {
        return false;
    }
    let actual_mode = metadata.permissions().mode() & 0o777;
    let state_perms = u32::from_str_radix(&state_entry.perms, 8).unwrap_or(0);
    actual_mode != state_perms
}

fn owner_differs_from_state(abs_path: &Path, state_entry: &FileEntry) -> bool {
    use std::os::unix::fs::MetadataExt;
    let Ok(metadata) = std::fs::symlink_metadata(abs_path) else {
        return true;
    };
    if metadata.file_type().is_symlink() {
        return false;
    }
    let actual_uid = metadata.uid();
    let actual_gid = metadata.gid();

    let parts: Vec<&str> = state_entry.owner.splitn(2, ':').collect();
    if parts.len() != 2 {
        return false;
    }

    if let (Ok(exp_uid), Ok(exp_gid)) = (parts[0].parse::<u32>(), parts[1].parse::<u32>()) {
        return actual_uid != exp_uid || actual_gid != exp_gid;
    }

    let exp_uid = nix::unistd::User::from_name(parts[0])
        .ok()
        .flatten()
        .map(|u| u.uid.as_raw());
    let exp_gid = nix::unistd::Group::from_name(parts[1])
        .ok()
        .flatten()
        .map(|g| g.gid.as_raw());

    match (exp_uid, exp_gid) {
        (Some(eu), Some(eg)) => actual_uid != eu || actual_gid != eg,
        _ => false,
    }
}

fn find_glob_for_source<'a>(
    abs_src: &Path,
    globs: &'a [ResolvedGlob],
    source_dir: &Path,
) -> Option<&'a ResolvedGlob> {
    let src_str = abs_src.to_string_lossy();
    globs.iter().find(|glob_entry| {
        let pattern_str = source_dir
            .join(&glob_entry.pattern)
            .to_string_lossy()
            .to_string();
        if let Ok(pattern) = glob::Pattern::new(&pattern_str) {
            pattern.matches(&src_str)
        } else {
            false
        }
    })
}

fn source_configured_owner_matches_target(
    abs_src: &Path,
    abs_tgt: &Path,
    globs: &[ResolvedGlob],
    source_dir: &Path,
) -> bool {
    let matching_glob = find_glob_for_source(abs_src, globs, source_dir);

    let configured_owner = match matching_glob.and_then(|g| g.owner.as_deref()) {
        Some(owner) => owner,
        None => return true,
    };

    use std::os::unix::fs::MetadataExt;
    let Ok(meta) = std::fs::symlink_metadata(abs_tgt) else {
        return false;
    };
    if meta.file_type().is_symlink() {
        return true;
    }

    let parts: Vec<&str> = configured_owner.splitn(2, ':').collect();
    if parts.len() != 2 {
        return false;
    }

    if let (Ok(exp_uid), Ok(exp_gid)) = (parts[0].parse::<u32>(), parts[1].parse::<u32>()) {
        return meta.uid() == exp_uid && meta.gid() == exp_gid;
    }

    let exp_uid = nix::unistd::User::from_name(parts[0])
        .ok()
        .flatten()
        .map(|u| u.uid.as_raw());
    let exp_gid = nix::unistd::Group::from_name(parts[1])
        .ok()
        .flatten()
        .map(|g| g.gid.as_raw());

    match (exp_uid, exp_gid) {
        (Some(eu), Some(eg)) => meta.uid() == eu && meta.gid() == eg,
        _ => false,
    }
}

fn source_configured_perms_match_target(
    abs_src: &Path,
    abs_tgt: &Path,
    globs: &[ResolvedGlob],
    source_dir: &Path,
) -> bool {
    let matching_glob = find_glob_for_source(abs_src, globs, source_dir);

    let file_perms = match matching_glob.and_then(|g| g.file_perms.as_ref()) {
        Some(preset) => preset,
        None => return true,
    };

    use std::os::unix::fs::PermissionsExt;
    let Ok(src_meta) = std::fs::symlink_metadata(abs_src) else {
        return false;
    };
    if src_meta.file_type().is_symlink() {
        return true;
    }
    let src_perms = src_meta.permissions().mode() & 0o777;
    let configured_perms = file_perms.map_permissions(src_perms);

    let Ok(tgt_meta) = std::fs::symlink_metadata(abs_tgt) else {
        return false;
    };
    if tgt_meta.file_type().is_symlink() {
        return true;
    }
    let tgt_perms = tgt_meta.permissions().mode() & 0o777;

    configured_perms == tgt_perms
}

fn compute_file_hash(
    path: &Path,
    is_symlink: bool,
    symlink_target: Option<&str>,
) -> Option<String> {
    use xxhash_rust::xxh3::xxh3_128;

    if is_symlink {
        if let Some(target) = symlink_target {
            let hash = xxh3_128(target.as_bytes());
            Some(format!("{:x}", hash))
        } else {
            None
        }
    } else {
        if let Ok(contents) = std::fs::read(path) {
            let hash = xxh3_128(&contents);
            Some(format!("{:x}", hash))
        } else {
            None
        }
    }
}

fn files_or_symlinks_identical(a: &Path, b: &Path, a_is_symlink: bool, b_is_symlink: bool) -> bool {
    if a_is_symlink && b_is_symlink {
        let target_a = std::fs::read_link(a).ok();
        let target_b = std::fs::read_link(b).ok();
        return target_a == target_b;
    }
    if a_is_symlink || b_is_symlink {
        return false;
    }
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

            let is_symlink = path.is_symlink();
            if !path.is_file() && !is_symlink {
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

            let metadata = std::fs::symlink_metadata(&path)
                .map_err(|e| format!("Cannot read metadata for '{}': {}", path.display(), e))?;
            let mtime = metadata
                .modified()
                .map_err(|e| format!("Cannot read mtime for '{}': {}", path.display(), e))?
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|e| format!("mtime before epoch for '{}': {}", path.display(), e))?
                .as_millis() as i64;

            let symlink_target = if is_symlink {
                Some(
                    std::fs::read_link(&path)
                        .map_err(|e| {
                            format!("Cannot read symlink target for '{}': {}", path.display(), e)
                        })?
                        .to_string_lossy()
                        .to_string(),
                )
            } else {
                None
            };

            files.push(DiscoveredFile {
                rel_path,
                mtime,
                is_symlink,
                symlink_target,
            });
        }
    }
    Ok(files)
}

pub fn validate_actions(changes: &mut [Change], config: &ResolvedConfig) {
    for change in changes.iter_mut() {
        validate_action(change, config);
    }
}

fn validate_action(change: &mut Change, config: &ResolvedConfig) {
    match change {
        Change::UpdateState { failed_checks, .. } => {
            check_state_writable(failed_checks, config);
        }
        Change::CopyToTarget {
            abs_src,
            abs_tgt,
            failed_checks,
            rel_path,
            group_index,
            ..
        } => {
            check_state_writable(failed_checks, config);
            let group = &config.sync_groups[*group_index];

            if abs_src.is_symlink() {
                return;
            }

            if let Some(parent) = abs_tgt.parent()
                && parent != group.target_dir
                && parent.exists()
                && !parent.is_dir()
            {
                failed_checks.push(format!(
                    "parent path '{}' exists but is not a directory",
                    parent.display()
                ));
            }
            if !abs_src.exists() && !abs_src.is_symlink() {
                failed_checks.push(format!(
                    "source file '{}' does not exist for CopyToTarget",
                    rel_path
                ));
            }

            if let Some(eu) = effective_user(config, *group_index) {
                check_parent_dirs_creatable(abs_tgt, &group.target_dir, eu, failed_checks);
            }
        }
        Change::CopyToSource {
            abs_src,
            abs_tgt,
            failed_checks,
            rel_path,
            group_index,
            ..
        } => {
            check_state_writable(failed_checks, config);
            let group = &config.sync_groups[*group_index];

            if abs_tgt.is_symlink() {
                return;
            }

            if !abs_tgt.exists() && !abs_tgt.is_symlink() {
                failed_checks.push(format!(
                    "target file '{}' does not exist for CopyToSource",
                    rel_path
                ));
            }
            if let Some(parent) = abs_src.parent()
                && parent.exists()
                && !parent.is_dir()
            {
                failed_checks.push(format!(
                    "source parent path '{}' is not a directory",
                    parent.display()
                ));
            }
            validate_target_perms_for_copy_to_source(
                abs_tgt,
                rel_path,
                *group_index,
                config,
                failed_checks,
            );
            validate_target_owner_for_copy_to_source(
                abs_tgt,
                rel_path,
                *group_index,
                config,
                failed_checks,
            );
            validate_copy_to_source_user(&config.config_path, failed_checks);

            use std::os::unix::fs::MetadataExt;
            let config_eu = if let Ok(meta) = std::fs::metadata(&config.config_path) {
                Some((meta.uid(), meta.gid()))
            } else {
                None
            };
            if let Some(eu) = config_eu {
                check_parent_dirs_creatable(abs_src, &group.source_dir, eu, failed_checks);
            }
        }
        Change::DeleteTarget {
            abs_tgt,
            failed_checks,
            group_index,
            ..
        } => {
            check_state_writable(failed_checks, config);
            if !abs_tgt.exists() {
                failed_checks.push("target file does not exist (already deleted?)".to_string());
                return;
            }
            if abs_tgt.is_symlink() {
                return;
            }
            if let Some(eu) = effective_user(config, *group_index) {
                check_delete_feasible(abs_tgt, eu, failed_checks);
            }
        }
        Change::DeleteSource {
            abs_src,
            failed_checks,
            ..
        } => {
            check_state_writable(failed_checks, config);
            if !abs_src.exists() {
                failed_checks.push("source file does not exist (already deleted?)".to_string());
                return;
            }
            if abs_src.is_symlink() {
                return;
            }
            use std::os::unix::fs::MetadataExt;
            let config_eu = if let Ok(meta) = std::fs::metadata(&config.config_path) {
                Some((meta.uid(), meta.gid()))
            } else {
                None
            };
            if let Some(eu) = config_eu {
                check_delete_feasible(abs_src, eu, failed_checks);
            }
        }
        Change::DeleteFromState { failed_checks, .. } => {
            check_state_writable(failed_checks, config);
        }
        Change::Conflict {
            abs_src,
            abs_tgt,
            failed_checks,
            group_index,
            ..
        } => {
            let group = &config.sync_groups[*group_index];
            if !abs_src.exists() && !abs_tgt.exists() {
                failed_checks.push("neither source nor target file exists".to_string());
            }
            if !abs_src.exists()
                && let Some(parent) = abs_src.parent()
                && !parent.exists()
            {
                failed_checks.push(format!(
                    "source parent directory '{}' does not exist for conflict resolution",
                    parent.display()
                ));
            }
            if !abs_tgt.exists()
                && let Some(parent) = abs_tgt.parent()
                && parent != group.target_dir
                && !parent.is_dir()
            {
                failed_checks.push(format!(
                    "target parent path '{}' is not a directory",
                    parent.display()
                ));
            }

            let mut ctt_checks: Vec<String> = Vec::new();
            let mut cts_checks: Vec<String> = Vec::new();

            let ctt_eu = effective_user(config, *group_index);

            use std::os::unix::fs::MetadataExt;
            let cts_eu = if let Ok(meta) = std::fs::metadata(&config.config_path) {
                Some((meta.uid(), meta.gid()))
            } else {
                None
            };

            if let Some(eu) = ctt_eu {
                check_parent_dirs_creatable(abs_tgt, &group.target_dir, eu, &mut ctt_checks);
                check_target_writable(abs_tgt, eu, &mut ctt_checks);
            }
            if let Some(eu) = cts_eu {
                check_parent_dirs_creatable(abs_src, &group.source_dir, eu, &mut cts_checks);
                check_target_writable(abs_src, eu, &mut cts_checks);
            }

            if !ctt_checks.is_empty() && !cts_checks.is_empty() {
                failed_checks.push(
                    "conflict cannot be resolved: neither CopyToTarget nor CopyToSource is feasible"
                        .to_string(),
                );
                failed_checks.push(format!(
                    "  CopyToTarget failures: {}",
                    ctt_checks.join(", ")
                ));
                failed_checks.push(format!(
                    "  CopyToSource failures: {}",
                    cts_checks.join(", ")
                ));
            }
        }
        Change::Clean { .. } | Change::Failed { .. } => {}
    }
}

fn check_delete_feasible(
    abs_path: &Path,
    effective_user: (u32, u32),
    failed_checks: &mut Vec<String>,
) {
    let (eu_uid, eu_gid) = effective_user;
    if eu_uid == 0 {
        return;
    }
    let Some(parent) = abs_path.parent() else {
        return;
    };
    let Ok(parent_meta) = std::fs::metadata(parent) else {
        return;
    };
    let Ok(file_meta) = std::fs::metadata(abs_path) else {
        return;
    };
    if !can_delete(eu_uid, eu_gid, &parent_meta, &file_meta) {
        failed_checks.push(format!(
            "cannot delete '{}' (insufficient permissions on parent directory)",
            abs_path.display()
        ));
    }
}

fn check_state_writable(failed_checks: &mut Vec<String>, config: &ResolvedConfig) {
    if let Some(parent) = config.state_path.parent()
        && parent.exists()
        && !parent.is_dir()
    {
        failed_checks.push("state file parent path is not a directory".to_string());
    }
}

fn validate_target_perms_for_copy_to_source(
    abs_tgt: &Path,
    rel_path: &str,
    group_index: usize,
    config: &ResolvedConfig,
    failed_checks: &mut Vec<String>,
) {
    use std::os::unix::fs::PermissionsExt;
    let Ok(metadata) = std::fs::symlink_metadata(abs_tgt) else {
        return;
    };
    if metadata.file_type().is_symlink() {
        return;
    }
    let actual_mode = metadata.permissions().mode() & 0o777;

    let group = &config.sync_groups[group_index];
    let glob = crate::sync::find_matching_glob(group, rel_path);

    if let Some(glob_entry) = glob
        && let Some(ref preset) = glob_entry.file_perms
    {
        let reversed = preset.reverse_map_permissions(actual_mode);
        let expected = preset.map_permissions(reversed);
        if actual_mode != expected {
            failed_checks.push(format!(
                "target file '{}' has permissions {:o}, expected {:o}",
                rel_path, actual_mode, expected
            ));
            return;
        }
    }

    if actual_mode != 0o644 && actual_mode != 0o755 {
        failed_checks.push(format!(
            "target file '{}' has permissions {:o}, must be 644 or 755 when no file_perms is configured",
            rel_path, actual_mode
        ));
    }
}

fn validate_target_owner_for_copy_to_source(
    abs_tgt: &Path,
    rel_path: &str,
    group_index: usize,
    config: &ResolvedConfig,
    failed_checks: &mut Vec<String>,
) {
    let group = &config.sync_groups[group_index];
    let glob = crate::sync::find_matching_glob(group, rel_path);

    let expected_owner = if let Some(glob_entry) = glob
        && let Some(ref owner_spec) = glob_entry.owner
    {
        owner_spec.clone()
    } else if let Some(ref owner_spec) = group.owner {
        owner_spec.clone()
    } else {
        format_owner_from_file_metadata(&config.config_path)
    };

    let actual_owner = format_owner_from_file_metadata(abs_tgt);
    if actual_owner != expected_owner {
        failed_checks.push(format!(
            "target file '{}' is owned by {}, expected '{}'",
            rel_path, actual_owner, expected_owner
        ));
    }
}

fn format_owner_from_file_metadata(path: &Path) -> String {
    use std::os::unix::fs::MetadataExt;
    let Ok(metadata) = std::fs::symlink_metadata(path) else {
        return String::new();
    };
    let uid = metadata.uid();
    let gid = metadata.gid();
    let user = nix::unistd::User::from_uid(nix::unistd::Uid::from_raw(uid))
        .ok()
        .flatten()
        .map(|u| u.name)
        .unwrap_or_else(|| uid.to_string());
    let group = nix::unistd::Group::from_gid(nix::unistd::Gid::from_raw(gid))
        .ok()
        .flatten()
        .map(|g| g.name)
        .unwrap_or_else(|| gid.to_string());
    format!("{}:{}", user, group)
}

fn validate_copy_to_source_user(config_path: &Path, failed_checks: &mut Vec<String>) {
    use std::os::unix::fs::MetadataExt;
    if !crate::sync::is_root() {
        let Ok(config_meta) = std::fs::metadata(config_path) else {
            return;
        };
        let current_uid = nix::unistd::Uid::current().as_raw();
        let config_uid = config_meta.uid();
        if current_uid != config_uid {
            failed_checks.push(format!(
                "cannot copy to source: must run as root or as the config file owner (uid {})",
                config_uid
            ));
        }
    }
}

fn effective_user(config: &ResolvedConfig, group_index: usize) -> Option<(u32, u32)> {
    use std::os::unix::fs::MetadataExt;
    let group = &config.sync_groups[group_index];
    if let Some(owner_spec) = group.globs.iter().find_map(|g| g.owner.clone()) {
        resolve_owner_spec_to_uid_gid(&owner_spec).ok()
    } else if let Ok(meta) = std::fs::metadata(&config.config_path) {
        Some((meta.uid(), meta.gid()))
    } else {
        None
    }
}

fn resolve_owner_spec_to_uid_gid(owner_spec: &str) -> Result<(u32, u32), String> {
    let parts: Vec<&str> = owner_spec.split(':').collect();
    if parts.len() != 2 {
        return Err(format!(
            "Invalid owner format '{}' (expected 'user:group')",
            owner_spec
        ));
    }
    let user_name = parts[0];
    let group_name = parts[1];
    let uid = nix::unistd::User::from_name(user_name)
        .map_err(|e| format!("Cannot look up user '{}': {}", user_name, e))?
        .map(|u| u.uid.as_raw())
        .unwrap_or(0);
    let gid = nix::unistd::Group::from_name(group_name)
        .map_err(|e| format!("Cannot look up group '{}': {}", group_name, e))?
        .map(|g| g.gid.as_raw())
        .unwrap_or(0);
    Ok((uid, gid))
}

#[allow(dead_code)]
fn can_write_impl(user_uid: u32, user_gid: u32, path_uid: u32, path_gid: u32, mode: u32) -> bool {
    if path_uid == user_uid {
        (mode & 0o200) != 0
    } else if path_gid == user_gid {
        (mode & 0o020) != 0
    } else {
        (mode & 0o002) != 0
    }
}

fn can_write_execute_dir(user_uid: u32, user_gid: u32, meta: &std::fs::Metadata) -> bool {
    use std::os::unix::fs::MetadataExt;
    if user_uid == 0 {
        return true;
    }
    let path_uid = meta.uid();
    let path_gid = meta.gid();
    let mode = meta.permissions().mode();
    if path_uid == user_uid {
        (mode & 0o300) == 0o300
    } else if path_gid == user_gid {
        (mode & 0o030) == 0o030
    } else {
        (mode & 0o003) == 0o003
    }
}

fn check_parent_dirs_creatable(
    abs_path: &Path,
    root: &Path,
    effective_user: (u32, u32),
    failed_checks: &mut Vec<String>,
) {
    let (eu_uid, eu_gid) = effective_user;

    let mut current = abs_path.to_path_buf();
    let mut missing_dirs: Vec<PathBuf> = Vec::new();

    while let Some(parent) = current.parent() {
        if !parent.starts_with(root) || parent == root {
            break;
        }
        if parent.exists() {
            if let Some(deepest_missing) = missing_dirs.pop()
                && let Ok(meta) = std::fs::metadata(parent)
                && !can_write_execute_dir(eu_uid, eu_gid, &meta)
            {
                failed_checks.push(format!(
                    "cannot create parent directory '{}' (no write+execute permission on '{}')",
                    deepest_missing.display(),
                    parent.display()
                ));
            }
            break;
        }
        missing_dirs.push(parent.to_path_buf());
        current = parent.to_path_buf();
    }

    if let Some(deepest_missing) = missing_dirs.pop()
        && let Ok(meta) = std::fs::metadata(root)
        && !can_write_execute_dir(eu_uid, eu_gid, &meta)
    {
        failed_checks.push(format!(
            "cannot create parent directory '{}' (no write+execute permission on '{}')",
            deepest_missing.display(),
            root.display()
        ));
    }
}

#[allow(dead_code)]
fn check_parent_dir_owner_and_perms(
    abs_path: &Path,
    group: &crate::config::ResolvedSyncGroup,
    effective_user: (u32, u32),
    failed_checks: &mut Vec<String>,
) {
    let Some(file_parent) = abs_path.parent() else {
        return;
    };
    let root = group
        .target_dir
        .canonicalize()
        .unwrap_or_else(|_| group.target_dir.clone());

    let (expected_uid, expected_gid) = effective_user;

    let expected_dir_perms = group.globs.iter().find_map(|g| g.dir_perms.clone());

    let mut current = file_parent.to_path_buf();

    while let Ok(current_canon) = current.canonicalize() {
        if current_canon == root || !current_canon.starts_with(&root) {
            break;
        }
        if !current.exists() {
            let Some(parent) = current.parent() else {
                break;
            };
            current = parent.to_path_buf();
            continue;
        }

        if let Ok(meta) = std::fs::metadata(&current) {
            if !meta.is_dir() {
                failed_checks.push(format!(
                    "parent path '{}' exists but is not a directory",
                    current.display()
                ));
                break;
            }

            use std::os::unix::fs::MetadataExt;
            let actual_uid = meta.uid();
            let actual_gid = meta.gid();
            if actual_uid != expected_uid || actual_gid != expected_gid {
                let actual_owner = format_uid_gid(actual_uid, actual_gid);
                let expected_owner = format_uid_gid(expected_uid, expected_gid);
                failed_checks.push(format!(
                    "parent directory '{}' is owned by {}, expected '{}'",
                    current.display(),
                    actual_owner,
                    expected_owner
                ));
            }

            if let Some(ref preset) = expected_dir_perms {
                let actual_mode = meta.permissions().mode() & 0o777;
                let expected_mode = preset.map_permissions(0o755);
                if actual_mode != expected_mode {
                    failed_checks.push(format!(
                        "parent directory '{}' has permissions {:o}, expected {:o}",
                        current.display(),
                        actual_mode,
                        expected_mode
                    ));
                }
            }
        }

        let Some(parent) = current.parent() else {
            break;
        };
        current = parent.to_path_buf();
    }
}

fn check_target_writable(
    abs_path: &Path,
    effective_user: (u32, u32),
    failed_checks: &mut Vec<String>,
) {
    use std::os::unix::fs::MetadataExt;
    let (eu_uid, eu_gid) = effective_user;

    if eu_uid == 0 {
        return;
    }

    if abs_path.exists() || abs_path.is_symlink() {
        if let Ok(meta) = std::fs::metadata(abs_path)
            && !can_write_impl(
                eu_uid,
                eu_gid,
                meta.uid(),
                meta.gid(),
                meta.permissions().mode(),
            )
        {
            failed_checks.push(format!(
                "target file '{}' is not writable",
                abs_path.display()
            ));
        }
    } else if let Some(parent) = abs_path.parent()
        && parent.exists()
        && let Ok(meta) = std::fs::metadata(parent)
        && !can_write_execute_dir(eu_uid, eu_gid, &meta)
    {
        failed_checks.push(format!(
            "cannot create target file '{}' (no write+execute permission on parent '{}')",
            abs_path.display(),
            parent.display()
        ));
    }
}

fn can_delete(
    user_uid: u32,
    user_gid: u32,
    parent_meta: &std::fs::Metadata,
    file_meta: &std::fs::Metadata,
) -> bool {
    use std::os::unix::fs::{MetadataExt, PermissionsExt};

    if !can_write_execute_dir(user_uid, user_gid, parent_meta) {
        return false;
    }

    let parent_mode = parent_meta.permissions().mode();
    if (parent_mode & 0o1000) != 0 {
        let file_uid = file_meta.uid();
        if user_uid != 0 && user_uid != file_uid {
            return false;
        }
    }

    true
}

#[allow(dead_code)]
fn check_owner_settable(
    group: &crate::config::ResolvedSyncGroup,
    rel_path: &str,
    is_copy_to_source: bool,
    config: &ResolvedConfig,
    failed_checks: &mut Vec<String>,
) {
    if crate::sync::is_root() {
        return;
    }

    use std::os::unix::fs::MetadataExt;
    let current_uid = nix::unistd::Uid::current().as_raw();

    if is_copy_to_source {
        if let Ok(meta) = std::fs::metadata(&config.config_path) {
            let config_uid = meta.uid();
            if current_uid != config_uid {
                failed_checks.push(format!(
                    "cannot set source file owner: must run as root or as config file owner (uid {})",
                    config_uid
                ));
            }
        }
    } else {
        let glob = crate::sync::find_matching_glob(group, rel_path);
        if let Some(ref owner_spec) = glob.and_then(|g| g.owner.as_ref())
            && let Ok((configured_uid, _configured_gid)) = resolve_owner_spec_to_uid_gid(owner_spec)
            && current_uid != configured_uid
        {
            failed_checks.push(format!(
                "cannot set owner '{}' for target file '{}' without root privileges",
                owner_spec, rel_path
            ));
        }
    }
}

#[allow(dead_code)]
fn format_uid_gid(uid: u32, gid: u32) -> String {
    let user = nix::unistd::User::from_uid(nix::unistd::Uid::from_raw(uid))
        .ok()
        .flatten()
        .map(|u| u.name)
        .unwrap_or_else(|| uid.to_string());
    let group = nix::unistd::Group::from_gid(nix::unistd::Gid::from_raw(gid))
        .ok()
        .flatten()
        .map(|g| g.name)
        .unwrap_or_else(|| gid.to_string());
    format!("{}:{}", user, group)
}

pub fn count_changes(changes: &[Change]) -> ChangeCounts {
    let mut counts = ChangeCounts::default();
    for change in changes {
        if !change.failed_checks().is_empty() {
            counts.failed += 1;
            continue;
        }
        match change {
            Change::CopyToTarget { .. } => counts.copy_to_target += 1,
            Change::CopyToSource { .. } => counts.copy_to_source += 1,
            Change::Conflict { .. } => counts.conflicts += 1,
            Change::DeleteTarget { .. } => counts.delete_target += 1,
            Change::DeleteSource { .. } => counts.delete_source += 1,
            Change::UpdateState { .. } => counts.update_state += 1,
            Change::Clean { .. } => counts.clean += 1,
            Change::Failed { .. } => counts.failed += 1,
            Change::DeleteFromState { .. } => {}
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
    pub update_state: usize,
    pub clean: usize,
    pub failed: usize,
}

fn resolve_permissions_for_file(
    abs_src: &Path,
    globs: &[ResolvedGlob],
    source_dir: &Path,
) -> Option<u32> {
    let src_str = abs_src.to_string_lossy();
    for glob_entry in globs {
        let pattern_str = source_dir
            .join(&glob_entry.pattern)
            .to_string_lossy()
            .to_string();
        if let Ok(pattern) = glob::Pattern::new(&pattern_str)
            && pattern.matches(&src_str)
            && let Some(ref preset) = glob_entry.file_perms
            && let Ok(metadata) = std::fs::symlink_metadata(abs_src)
        {
            let src_perms = metadata.permissions().mode() & 0o777;
            return Some(preset.map_permissions(src_perms));
        }
    }
    None
}

fn target_permissions_differ(
    _rel_path: &str,
    abs_tgt: &Path,
    _state_entry: &FileEntry,
    abs_src: &Path,
    globs: &[ResolvedGlob],
    source_dir: &Path,
) -> bool {
    if let Ok(tgt_meta) = std::fs::symlink_metadata(abs_tgt) {
        if tgt_meta.file_type().is_symlink() {
            return false;
        }
        let actual_mode = tgt_meta.permissions().mode() & 0o777;
        if let Some(configured_mode) = resolve_permissions_for_file(abs_src, globs, source_dir) {
            return actual_mode != configured_mode;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::ResolvedGlob;
    use crate::state::FileEntry;

    fn make_glob(pattern: &str) -> ResolvedGlob {
        ResolvedGlob {
            pattern: pattern.to_string(),
            file_perms: None,
            dir_perms: None,
            owner: None,
        }
    }

    fn make_file_entry(
        group: &str,
        path: &str,
        hash: &str,
        perms: &str,
        owner: &str,
        mtime: &str,
    ) -> FileEntry {
        FileEntry {
            group: group.to_string(),
            path: path.to_string(),
            hash: hash.to_string(),
            perms: perms.to_string(),
            owner: owner.to_string(),
            mtime: mtime.to_string(),
            file_type: "file".to_string(),
        }
    }

    fn make_state_entry_from_file(
        fs_path: &Path,
        group_path: &str,
        rel_path: &str,
        perms: &str,
        owner: &str,
    ) -> FileEntry {
        let hash = compute_file_hash(fs_path, fs_path.is_symlink(), None).unwrap_or_default();
        let mtime = unix_timestamp(fs_path);
        let mtime_str = format!(
            "{}",
            DateTime::from_timestamp_millis(mtime)
                .unwrap()
                .format("%Y-%m-%dT%H:%M:%S.%.3fZ")
        );
        FileEntry {
            group: group_path.to_string(),
            path: rel_path.to_string(),
            hash,
            perms: perms.to_string(),
            owner: owner.to_string(),
            mtime: mtime_str,
            file_type: if fs_path.is_symlink() {
                "symlink".to_string()
            } else {
                "file".to_string()
            },
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
                    file_perms: None,
                    dir_perms: None,
                    owner: None,
                    deviating: vec![],
                    hook_after: None,
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
            file: vec![make_state_entry_from_file(
                &tgt_file,
                &tgt.to_string_lossy(),
                "app.conf",
                "644",
                "user:user",
            )],
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
            file: vec![make_state_entry_from_file(
                &src_file,
                &tgt.to_string_lossy(),
                "app.conf",
                "644",
                "user:user",
            )],
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
            file: vec![make_file_entry(
                &tgt.to_string_lossy(),
                "app.conf",
                "deadbeef",
                "644",
                "user:user",
                "1970-01-01T00:00:01.000Z",
            )],
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

        let state = State {
            last_sync: chrono::Utc::now(),
            file: vec![make_state_entry_from_file(
                &tgt.join("app.conf"),
                &tgt.to_string_lossy(),
                "app.conf",
                "644",
                "user:user",
            )],
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

        let state = State {
            last_sync: chrono::Utc::now(),
            file: vec![make_state_entry_from_file(
                &src.join("app.conf"),
                &tgt.to_string_lossy(),
                "app.conf",
                "644",
                "user:user",
            )],
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
            file: vec![make_file_entry(
                &tgt.to_string_lossy(),
                "old.conf",
                "abc",
                "644",
                "user:user",
                "1970-01-01T00:00:01.000Z",
            )],
        };
        let config = make_single_config(&src, &tgt, &dir.path().join("state"));

        let changes = classify(&config, &state, false, false).unwrap();
        assert_eq!(changes.len(), 1);
        assert!(matches!(changes[0], Change::DeleteFromState { .. }));
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
        let mtime_str = format!(
            "{}",
            DateTime::from_timestamp_millis(mtime)
                .unwrap()
                .format("%Y-%m-%dT%H:%M:%S.%.3fZ")
        );
        let hash = compute_file_hash(&src_file, false, None).unwrap();

        let state = State {
            last_sync: chrono::Utc::now(),
            file: vec![make_file_entry(
                &tgt.to_string_lossy(),
                "app.conf",
                &hash,
                "644",
                "user:user",
                &mtime_str,
            )],
        };
        let config = make_single_config(&src, &tgt, &dir.path().join("state"));

        let changes = classify(&config, &state, false, false).unwrap();
        assert_eq!(changes.len(), 1);
        assert!(matches!(changes[0], Change::Clean { .. }));
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
                    file_perms: None,
                    dir_perms: None,
                    owner: None,
                    deviating: vec![],
                    hook_after: None,
                },
                crate::config::ResolvedSyncGroup {
                    source_dir: src,
                    target_dir: tgt2,
                    globs: vec![make_glob("**/*")],
                    file_perms: None,
                    dir_perms: None,
                    owner: None,
                    deviating: vec![],
                    hook_after: None,
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
                    file_perms: None,
                    dir_perms: None,
                    owner: None,
                    deviating: vec![],
                    hook_after: None,
                },
                crate::config::ResolvedSyncGroup {
                    source_dir: src2,
                    target_dir: tgt2,
                    globs: vec![make_glob("file2.*")],
                    file_perms: None,
                    dir_perms: None,
                    owner: None,
                    deviating: vec![],
                    hook_after: None,
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
        let tgt2 = dir.path().join("target2");
        std::fs::create_dir(&src).unwrap();
        std::fs::create_dir(&tgt).unwrap();
        std::fs::create_dir(&tgt2).unwrap();

        std::fs::write(src.join("file.txt"), "content").unwrap();

        let config = ResolvedConfig {
            config_dir: dir.path().to_path_buf(),
            config_path: dir.path().join("state").with_extension("toml"),
            sync_groups: vec![
                crate::config::ResolvedSyncGroup {
                    source_dir: src.clone(),
                    target_dir: tgt.clone(),
                    globs: vec![make_glob("**/*.txt")],
                    file_perms: None,
                    dir_perms: None,
                    owner: None,
                    deviating: vec![],
                    hook_after: None,
                },
                crate::config::ResolvedSyncGroup {
                    source_dir: src.clone(),
                    target_dir: tgt2.clone(),
                    globs: vec![make_glob("*.nothing")],
                    file_perms: None,
                    dir_perms: None,
                    owner: None,
                    deviating: vec![],
                    hook_after: None,
                },
            ],
            state_path: dir.path().join("state"),
        };

        let state = State::empty();
        let changes = classify(&config, &state, false, false).unwrap();
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
        let tgt1 = dir.path().join("target1");
        let tgt2 = dir.path().join("target2");
        std::fs::create_dir(&src).unwrap();
        std::fs::create_dir(&tgt1).unwrap();
        std::fs::create_dir(&tgt2).unwrap();

        std::fs::write(src.join("app.conf"), "conf").unwrap();
        std::fs::write(src.join("readme.txt"), "txt").unwrap();

        let config = ResolvedConfig {
            config_dir: dir.path().to_path_buf(),
            config_path: dir.path().join("state").with_extension("toml"),
            sync_groups: vec![
                crate::config::ResolvedSyncGroup {
                    source_dir: src.clone(),
                    target_dir: tgt1.clone(),
                    globs: vec![make_glob("*.conf")],
                    file_perms: None,
                    dir_perms: None,
                    owner: None,
                    deviating: vec![],
                    hook_after: None,
                },
                crate::config::ResolvedSyncGroup {
                    source_dir: src.clone(),
                    target_dir: tgt2.clone(),
                    globs: vec![make_glob("*.txt")],
                    file_perms: None,
                    dir_perms: None,
                    owner: None,
                    deviating: vec![],
                    hook_after: None,
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

        let state = State {
            last_sync: chrono::Utc::now(),
            file: vec![
                make_file_entry(
                    &tgt1.to_string_lossy(),
                    "app.conf",
                    "abc",
                    "644",
                    "user:user",
                    "1970-01-01T00:00:01.000Z",
                ),
                make_file_entry(
                    &tgt2.to_string_lossy(),
                    "gone2.conf",
                    "def",
                    "644",
                    "user:user",
                    "1970-01-01T00:00:02.000Z",
                ),
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
                    file_perms: None,
                    dir_perms: None,
                    owner: None,
                    deviating: vec![],
                    hook_after: None,
                },
                crate::config::ResolvedSyncGroup {
                    source_dir: src2,
                    target_dir: tgt2,
                    globs: vec![make_glob("**/*")],
                    file_perms: None,
                    dir_perms: None,
                    owner: None,
                    deviating: vec![],
                    hook_after: None,
                },
            ],
            state_path: dir.path().join("state"),
        };

        let changes = classify(&config, &state, false, false).unwrap();
        assert_eq!(changes.len(), 2);
        assert!(
            changes
                .iter()
                .any(|c| matches!(c, Change::DeleteFromState { group_index: 0, .. }))
        );
        assert!(
            changes
                .iter()
                .any(|c| matches!(c, Change::DeleteFromState { group_index: 1, .. }))
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
            .as_millis() as i64
    }
}
