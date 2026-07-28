use crate::changes::Change;
use crate::config::ResolvedConfig;
use crate::state::{FileEntry, State};
use chrono::DateTime;
use similar::TextDiff;
use std::collections::HashSet;
use std::io::Read;
use std::path::Path;

struct SyncOutcome {
    copied_to_target: usize,
    copied_to_source: usize,
    deleted_from_target: usize,
    deleted_from_source: usize,
    skipped_perms: usize,
    conflicts_total: usize,
    conflicts_resolved: usize,
    #[allow(dead_code)]
    updated_state: usize,
    hook_failures: usize,
}

pub fn run(
    config: &ResolvedConfig,
    state: &mut State,
    changes: Vec<Change>,
    interactive: bool,
    dry_run: bool,
) -> Result<(), String> {
    let conflicts: Vec<&Change> = changes
        .iter()
        .filter(|c| matches!(c, Change::Conflict { .. }))
        .collect();

    let mut conflict_count = conflicts.len();

    if !conflicts.is_empty() && !interactive {
        eprintln!("Conflicts detected ({} files):", conflict_count);
        for c in &conflicts {
            if let Change::Conflict { rel_path, .. } = c {
                eprintln!("  {}", rel_path);
            }
        }
        return Err(format!(
            "Aborting due to {} conflict(s). Use -i/--interactive to resolve.",
            conflict_count
        ));
    }

    let mut outcome = SyncOutcome {
        copied_to_target: 0,
        copied_to_source: 0,
        deleted_from_target: 0,
        deleted_from_source: 0,
        skipped_perms: 0,
        conflicts_total: conflict_count,
        conflicts_resolved: 0,
        updated_state: 0,
        hook_failures: 0,
    };

    let mut groups_with_copy_to_target: HashSet<usize> = HashSet::new();
    let mut skipped_conflicts: HashSet<(usize, String)> = HashSet::new();
    let mut files_with_warnings: HashSet<(usize, String)> = HashSet::new();

    let bypass = security_bypass(config);

    for change in &changes {
        if !change.failed_checks().is_empty() {
            for reason in change.failed_checks() {
                eprintln!("Warning: skipping '{}': {}", change.rel_path(), reason);
            }
            outcome.skipped_perms += 1;
            continue;
        }

        match change {
            Change::CopyToTarget {
                rel_path,
                abs_src,
                abs_tgt,
                group_index,
                ..
            } if !interactive => {
                if !bypass {
                    match security_action(config, *group_index, abs_tgt, false) {
                        SecurityAction::ErrorSkip => {
                            eprintln!(
                                "Error: cannot copy '{}' to target (config file owner lacks write permission)",
                                rel_path
                            );
                            outcome.skipped_perms += 1;
                            continue;
                        }
                        SecurityAction::None => {}
                    }
                }
                if !bypass
                    && !has_explicit_owner(config, *group_index, rel_path)
                    && parent_dir_owned_by_foreign_user(
                        abs_tgt,
                        config_file_uid(&config.config_path),
                    )
                {
                    eprintln!(
                        "Warning: skipping '{}' (target parent directory is owned by another user, set explicit owner to override)",
                        rel_path
                    );
                    outcome.skipped_perms += 1;
                    continue;
                }
                if let Some(warning) = check_owner_feasibility(config, *group_index, rel_path) {
                    eprintln!("{}", warning);
                    outcome.skipped_perms += 1;
                    files_with_warnings.insert((*group_index, rel_path.to_string()));
                    continue;
                }
                if dry_run {
                    println!("[dry-run] copy {} -> target", rel_path);
                    outcome.copied_to_target += 1;
                    groups_with_copy_to_target.insert(*group_index);
                } else {
                    match copy_file(abs_src, abs_tgt) {
                        Ok(()) => {
                            println!("copied {} -> target", rel_path);
                            outcome.copied_to_target += 1;
                            groups_with_copy_to_target.insert(*group_index);
                            apply_target_permissions(config, *group_index, rel_path, &mut outcome);
                        }
                        Err(e) => {
                            eprintln!(
                                "Warning: skipping '{}' (cannot copy to target): {}",
                                rel_path, e
                            );
                            outcome.skipped_perms += 1;
                        }
                    }
                }
            }

            Change::CopyToSource {
                rel_path,
                abs_src,
                abs_tgt,
                group_index,
                ..
            } if !interactive => {
                if let Err(e) =
                    validate_target_for_copy_to_source(abs_tgt, rel_path, config, *group_index)
                {
                    eprintln!("{}", e);
                    outcome.skipped_perms += 1;
                    continue;
                }
                if dry_run {
                    println!("[dry-run] copy {} -> source", rel_path);
                    outcome.copied_to_source += 1;
                } else {
                    match copy_file(abs_tgt, abs_src) {
                        Ok(()) => {
                            println!("copied target -> {}", rel_path);
                            apply_source_owner(config, *group_index, abs_src);
                            outcome.copied_to_source += 1;
                        }
                        Err(e) => {
                            eprintln!(
                                "Warning: skipping '{}' (cannot copy to source): {}",
                                rel_path, e
                            );
                            outcome.skipped_perms += 1;
                        }
                    }
                }
            }

            Change::DeleteTarget {
                rel_path,
                abs_tgt,
                group_index,
                ..
            } if !interactive => {
                if !bypass {
                    match security_action(config, *group_index, abs_tgt, true) {
                        SecurityAction::ErrorSkip => {
                            eprintln!(
                                "Error: cannot delete '{}' from target (config file owner lacks write permission)",
                                rel_path
                            );
                            outcome.skipped_perms += 1;
                            continue;
                        }
                        SecurityAction::None => {}
                    }
                }
                if dry_run {
                    println!("[dry-run] delete target/{}", rel_path);
                } else {
                    match std::fs::remove_file(abs_tgt) {
                        Ok(()) => {
                            println!("deleted {}", rel_path);
                            outcome.deleted_from_target += 1;
                        }
                        Err(e) => {
                            eprintln!(
                                "Warning: skipping '{}' (cannot delete from target): {}",
                                rel_path, e
                            );
                            outcome.skipped_perms += 1;
                        }
                    }
                }
            }

            Change::DeleteSource {
                rel_path, abs_src, ..
            } if !interactive => {
                if dry_run {
                    println!("[dry-run] delete source/{}", rel_path);
                } else {
                    match std::fs::remove_file(abs_src) {
                        Ok(()) => {
                            println!("deleted source/{}", rel_path);
                            outcome.deleted_from_source += 1;
                        }
                        Err(e) => {
                            eprintln!(
                                "Warning: skipping '{}' (cannot delete from source): {}",
                                rel_path, e
                            );
                            outcome.skipped_perms += 1;
                        }
                    }
                }
            }

            Change::DeleteFromState { .. }
            | Change::Clean { .. }
            | Change::UpdateState { .. }
            | Change::Failed { .. } => {}

            _ => {}
        }
    }

    // Handle interactive conflicts
    if interactive {
        for change in &changes {
            match change {
                Change::Conflict {
                    rel_path,
                    abs_src,
                    abs_tgt,
                    group_index,
                    ..
                } => {
                    eprintln!("\n=== Conflict: {} ===", rel_path);
                    eprint_diff(abs_src, abs_tgt);

                    let choice = prompt_user(abs_src, abs_tgt)?;

                    match choice.as_str() {
                        "t" => {
                            if !is_root() && has_explicit_owner(config, *group_index, rel_path) {
                                eprintln!(
                                    "Owner warning: '{}' should be owned by configured owner (run as root to fix)",
                                    rel_path
                                );
                                outcome.skipped_perms += 1;
                                outcome.conflicts_resolved += 1;
                                continue;
                            }
                            if dry_run {
                                println!("[dry-run] would copy source -> target: {}", rel_path);
                            } else {
                                match copy_file(abs_src, abs_tgt) {
                                    Ok(()) => {
                                        println!("resolved: {} (kept source)", rel_path);
                                        outcome.copied_to_target += 1;
                                        outcome.conflicts_resolved += 1;
                                        groups_with_copy_to_target.insert(*group_index);
                                        apply_target_permissions(
                                            config,
                                            *group_index,
                                            rel_path,
                                            &mut outcome,
                                        );
                                    }
                                    Err(e) => {
                                        eprintln!("Warning: skipping '{}': {}", rel_path, e);
                                        outcome.skipped_perms += 1;
                                        outcome.conflicts_resolved += 1;
                                    }
                                }
                            }
                        }
                        "s" => {
                            if dry_run {
                                println!("[dry-run] would copy target -> source: {}", rel_path);
                            } else {
                                match copy_file(abs_tgt, abs_src) {
                                    Ok(()) => {
                                        println!("resolved: {} (kept target)", rel_path);
                                        apply_source_owner(config, *group_index, abs_src);
                                        outcome.copied_to_source += 1;
                                        outcome.conflicts_resolved += 1;
                                    }
                                    Err(e) => {
                                        eprintln!("Warning: skipping '{}': {}", rel_path, e);
                                        outcome.skipped_perms += 1;
                                        outcome.conflicts_resolved += 1;
                                    }
                                }
                            }
                        }
                        "q" => {
                            println!("Aborting sync ({} conflicts remaining).", conflict_count);
                            return Err("Aborted by user.".to_string());
                        }
                        _ => {
                            println!("skipped conflict: {}", rel_path);
                            skipped_conflicts.insert((*group_index, rel_path.clone()));
                            conflict_count -= 1;
                        }
                    }
                }

                Change::CopyToTarget {
                    rel_path,
                    abs_src,
                    abs_tgt,
                    group_index,
                    ..
                } => {
                    if !bypass {
                        match security_action(config, *group_index, abs_tgt, false) {
                            SecurityAction::ErrorSkip => {
                                eprintln!(
                                    "Error: cannot copy '{}' to target (config file owner lacks write permission)",
                                    rel_path
                                );
                                outcome.skipped_perms += 1;
                                continue;
                            }
                            SecurityAction::None => {}
                        }
                        if !has_explicit_owner(config, *group_index, rel_path)
                            && parent_dir_owned_by_foreign_user(
                                abs_tgt,
                                config_file_uid(&config.config_path),
                            )
                        {
                            eprintln!(
                                "Warning: skipping '{}' (target parent directory is owned by another user, set explicit owner to override)",
                                rel_path
                            );
                            outcome.skipped_perms += 1;
                            continue;
                        }
                    }
                    if let Some(warning) = check_owner_feasibility(config, *group_index, rel_path) {
                        eprintln!("{}", warning);
                        outcome.skipped_perms += 1;
                        files_with_warnings.insert((*group_index, rel_path.to_string()));
                        continue;
                    }
                    if dry_run {
                        println!("[dry-run] copy {} -> target", rel_path);
                    } else {
                        match copy_file(abs_src, abs_tgt) {
                            Ok(()) => {
                                println!("copied {} -> target", rel_path);
                                outcome.copied_to_target += 1;
                                groups_with_copy_to_target.insert(*group_index);
                                apply_target_permissions(
                                    config,
                                    *group_index,
                                    rel_path,
                                    &mut outcome,
                                );
                            }
                            Err(e) => {
                                eprintln!(
                                    "Warning: skipping '{}' (cannot copy to target): {}",
                                    rel_path, e
                                );
                                outcome.skipped_perms += 1;
                            }
                        }
                    }
                }

                Change::CopyToSource {
                    rel_path,
                    abs_src,
                    abs_tgt,
                    group_index,
                    ..
                } => {
                    if let Err(e) =
                        validate_target_for_copy_to_source(abs_tgt, rel_path, config, *group_index)
                    {
                        eprintln!("{}", e);
                        outcome.skipped_perms += 1;
                        continue;
                    }
                    if let Some(warning) = check_owner_feasibility(config, *group_index, rel_path) {
                        eprintln!("{}", warning);
                        outcome.skipped_perms += 1;
                        continue;
                    }
                    if dry_run {
                        println!("[dry-run] copy {} -> source", rel_path);
                    } else {
                        match copy_file(abs_tgt, abs_src) {
                            Ok(()) => {
                                println!("copied target -> {}", rel_path);
                                apply_source_owner(config, *group_index, abs_src);
                                outcome.copied_to_source += 1;
                            }
                            Err(e) => {
                                eprintln!(
                                    "Warning: skipping '{}' (cannot copy to source): {}",
                                    rel_path, e
                                );
                                outcome.skipped_perms += 1;
                            }
                        }
                    }
                }

                Change::DeleteTarget {
                    rel_path,
                    abs_tgt,
                    group_index,
                    ..
                } => {
                    if !bypass {
                        match security_action(config, *group_index, abs_tgt, true) {
                            SecurityAction::ErrorSkip => {
                                eprintln!(
                                    "Error: cannot delete '{}' from target (config file owner lacks write permission)",
                                    rel_path
                                );
                                outcome.skipped_perms += 1;
                                continue;
                            }
                            SecurityAction::None => {}
                        }
                    }
                    if dry_run {
                        println!("[dry-run] delete target/{}", rel_path);
                    } else {
                        match std::fs::remove_file(abs_tgt) {
                            Ok(()) => {
                                println!("deleted {}", rel_path);
                                outcome.deleted_from_target += 1;
                            }
                            Err(e) => {
                                eprintln!(
                                    "Warning: skipping '{}' (cannot delete from target): {}",
                                    rel_path, e
                                );
                                outcome.skipped_perms += 1;
                            }
                        }
                    }
                }

                Change::DeleteSource {
                    rel_path, abs_src, ..
                } => {
                    if dry_run {
                        println!("[dry-run] delete source/{}", rel_path);
                    } else {
                        match std::fs::remove_file(abs_src) {
                            Ok(()) => {
                                println!("deleted source/{}", rel_path);
                                outcome.deleted_from_source += 1;
                            }
                            Err(e) => {
                                eprintln!(
                                    "Warning: skipping '{}' (cannot delete from source): {}",
                                    rel_path, e
                                );
                                outcome.skipped_perms += 1;
                            }
                        }
                    }
                }

                Change::DeleteFromState { .. }
                | Change::Clean { .. }
                | Change::UpdateState { .. }
                | Change::Failed { .. } => {}
            }
        }
    }

    if !dry_run {
        if is_root() {
            enforce_permissions_root(config, state)?;
        }

        check_deviating_directories(config);

        // Run hooks for groups that had files copied to target
        for &group_index in &groups_with_copy_to_target {
            run_hook_for_group(config, group_index, false, &mut outcome)?;
        }

        // Rebuild state from current filesystem
        update_state(config, state, &skipped_conflicts, &files_with_warnings);
        state.save(&config.state_path)?;
        chown_state_file(&config.state_path, &config.config_path);
    } else {
        for &group_index in &groups_with_copy_to_target {
            run_hook_for_group(config, group_index, true, &mut outcome)?;
        }
    }

    // Print summary
    println!();
    println!("source -> target: {}", outcome.copied_to_target);
    println!("target -> source: {}", outcome.copied_to_source);
    println!("deleted target:   {}", outcome.deleted_from_target);
    println!("deleted source:   {}", outcome.deleted_from_source);
    if outcome.conflicts_total > 0 {
        println!("conflicts:        {}", outcome.conflicts_total);
        let skipped = outcome.conflicts_total - outcome.conflicts_resolved;
        println!("  resolved:       {}", outcome.conflicts_resolved);
        println!("  skipped:        {}", skipped);
    }
    if outcome.skipped_perms > 0 {
        println!("permission skips: {}", outcome.skipped_perms);
    }
    if outcome.hook_failures > 0 {
        println!("hook failures:    {}", outcome.hook_failures);
    }

    Ok(())
}

fn copy_file(src: &Path, dst: &Path) -> Result<(), String> {
    if let Some(parent) = dst.parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            format!(
                "Cannot create parent directory '{}': {}",
                parent.display(),
                e
            )
        })?;
    }

    if std::fs::symlink_metadata(dst).is_ok() {
        std::fs::remove_file(dst).map_err(|e| {
            format!(
                "Cannot remove existing file '{}' before copy: {}",
                dst.display(),
                e
            )
        })?;
    }

    if src.is_symlink() {
        let target = std::fs::read_link(src)
            .map_err(|e| format!("Cannot read symlink target for '{}': {}", src.display(), e))?;
        std::os::unix::fs::symlink(&target, dst).map_err(|e| {
            format!(
                "Cannot create symlink '{}' -> '{}': {}",
                dst.display(),
                target.display(),
                e
            )
        })?;
        #[cfg(feature = "faketime")]
        crate::time::set_symlink_mtime(dst, crate::time::now());
        return Ok(());
    }

    std::fs::copy(src, dst).map_err(|e| {
        format!(
            "Cannot copy '{}' to '{}': {}",
            src.display(),
            dst.display(),
            e
        )
    })?;

    let src_metadata = std::fs::metadata(src)
        .map_err(|e| format!("Cannot read metadata of '{}': {}", src.display(), e))?;
    let mtime = src_metadata
        .modified()
        .map_err(|e| format!("Cannot read mtime of '{}': {}", src.display(), e))?;

    let dst_file = std::fs::File::open(dst)
        .map_err(|e| format!("Cannot open copied file '{}': {}", dst.display(), e))?;
    dst_file
        .set_modified(mtime)
        .map_err(|e| format!("Cannot set mtime on '{}': {}", dst.display(), e))?;

    if is_root() {
        use std::os::unix::fs::MetadataExt;
        let uid = nix::unistd::Uid::from_raw(src_metadata.uid());
        let gid = nix::unistd::Gid::from_raw(src_metadata.gid());
        let _ = nix::unistd::chown(dst, Some(uid), Some(gid));
    }

    Ok(())
}

fn update_state(
    config: &ResolvedConfig,
    state: &mut State,
    skipped_conflicts: &HashSet<(usize, String)>,
    files_with_warnings: &HashSet<(usize, String)>,
) {
    let preserved: Vec<FileEntry> = state
        .file
        .iter()
        .filter(|f| {
            config.sync_groups.iter().enumerate().any(|(gi, g)| {
                g.target_dir.to_string_lossy() == f.group
                    && files_with_warnings.contains(&(gi, f.path.clone()))
            })
        })
        .cloned()
        .collect();

    state.last_sync = crate::time::now();
    state.file.clear();

    let mut seen = std::collections::HashSet::new();

    for (group_index, group) in config.sync_groups.iter().enumerate() {
        let group_path = group.target_dir.to_string_lossy().to_string();

        for glob_entry in &group.globs {
            let pattern_str = group
                .source_dir
                .join(&glob_entry.pattern)
                .to_string_lossy()
                .to_string();

            let paths = match glob::glob(&pattern_str) {
                Ok(p) => p,
                Err(e) => {
                    eprintln!("Warning: invalid glob '{}': {}", pattern_str, e);
                    continue;
                }
            };

            for entry in paths {
                let abs_path = match entry {
                    Ok(p) => p,
                    Err(e) => {
                        eprintln!("Warning: glob error for '{}': {}", pattern_str, e);
                        continue;
                    }
                };

                if !abs_path.is_file() && !abs_path.is_symlink() {
                    continue;
                }

                let rel_path = match abs_path.strip_prefix(&group.source_dir) {
                    Ok(p) => p.to_string_lossy().to_string(),
                    Err(_) => continue,
                };

                if !seen.insert((group_index, rel_path.clone())) {
                    continue;
                }

                if skipped_conflicts.contains(&(group_index, rel_path.clone()))
                    || files_with_warnings.contains(&(group_index, rel_path.clone()))
                {
                    continue;
                }

                let (src_mtime, is_symlink, _symlink_target) = file_attrs(&abs_path);
                let tgt_path = group.target_dir.join(&rel_path);
                let (tgt_mtime, _, _) = file_attrs(&tgt_path);

                if src_mtime > 0 || tgt_mtime > 0 || is_symlink {
                    let hash = compute_file_hash_for_state(&abs_path);
                    let hash_str = hash.unwrap_or_default();
                    let perms = resolve_file_perms(&abs_path, group);
                    let owner = resolve_file_owner(&abs_path, group);
                    let mtime_val = src_mtime.max(tgt_mtime);
                    let mtime_str = if mtime_val > 0 {
                        DateTime::from_timestamp_millis(mtime_val)
                            .map(|dt| dt.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string())
                            .unwrap_or_default()
                    } else {
                        String::new()
                    };

                    let file_type = if abs_path.is_symlink() {
                        "symlink".to_string()
                    } else {
                        "file".to_string()
                    };

                    state.file.push(FileEntry {
                        group: group_path.clone(),
                        path: rel_path,
                        hash: hash_str,
                        perms,
                        owner,
                        mtime: mtime_str,
                        file_type,
                    });
                }
            }
        }
    }

    for entry in preserved {
        state.file.push(entry);
    }
}

fn file_attrs(path: &Path) -> (i64, bool, Option<String>) {
    let metadata = match std::fs::symlink_metadata(path) {
        Ok(m) => m,
        Err(_) => return (0, false, None),
    };
    let mtime = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    let is_symlink = metadata.file_type().is_symlink();
    let symlink_target = if is_symlink {
        std::fs::read_link(path)
            .ok()
            .map(|p| p.to_string_lossy().to_string())
    } else {
        None
    };
    (mtime, is_symlink, symlink_target)
}

fn parent_dir_owned_by_foreign_user(abs_tgt: &Path, config_uid: u32) -> bool {
    use std::os::unix::fs::MetadataExt;
    let Some(parent) = abs_tgt.parent() else {
        return false;
    };
    if !parent.exists() {
        return false;
    }
    let Ok(meta) = std::fs::metadata(parent) else {
        return false;
    };
    meta.uid() != config_uid
}

fn validate_target_for_copy_to_source(
    abs_tgt: &Path,
    rel_path: &str,
    config: &ResolvedConfig,
    group_index: usize,
) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;

    let group = &config.sync_groups[group_index];
    let glob = find_matching_glob(group, rel_path);

    let metadata = std::fs::symlink_metadata(abs_tgt).map_err(|e| {
        format!(
            "Warning: skipping '{}' (cannot stat target): {}",
            rel_path, e
        )
    })?;
    let actual_mode = metadata.permissions().mode() & 0o777;

    if let Some(glob_entry) = glob {
        if let Some(ref preset) = glob_entry.file_perms {
            let reversed = preset.reverse_map_permissions(actual_mode);
            let expected = preset.map_permissions(reversed);
            if actual_mode != expected {
                return Err(format!(
                    "Warning: skipping '{}' (target file has unexpected permissions {:o}, expected {:o} for this preset)",
                    rel_path, actual_mode, expected
                ));
            }
        }

        if let Some(ref owner_spec) = glob_entry.owner
            && !owner_spec_matches(&metadata, owner_spec)
        {
            return Err(format!(
                "Warning: skipping '{}' (target file is owned by {}, expected '{}')",
                rel_path,
                format_actual_owner(&metadata),
                owner_spec
            ));
        }
    }

    Ok(())
}

fn find_matching_glob<'a>(
    group: &'a crate::config::ResolvedSyncGroup,
    rel_path: &str,
) -> Option<&'a crate::config::ResolvedGlob> {
    let src_path = group.source_dir.join(rel_path);
    let src_str = src_path.to_string_lossy();
    for glob_entry in &group.globs {
        let pattern_str = group
            .source_dir
            .join(&glob_entry.pattern)
            .to_string_lossy()
            .to_string();
        if let Ok(pattern) = glob::Pattern::new(&pattern_str)
            && pattern.matches(&src_str)
        {
            return Some(glob_entry);
        }
    }
    None
}

fn has_explicit_owner(config: &ResolvedConfig, group_index: usize, rel_path: &str) -> bool {
    let group = &config.sync_groups[group_index];
    if group.owner.is_some() {
        return true;
    }
    find_matching_glob(group, rel_path)
        .map(|g| g.owner.is_some())
        .unwrap_or(false)
}

fn apply_target_permissions(
    config: &ResolvedConfig,
    group_index: usize,
    rel_path: &str,
    outcome: &mut SyncOutcome,
) {
    use std::os::unix::fs::PermissionsExt;

    let group = &config.sync_groups[group_index];
    let glob_entry = match find_matching_glob(group, rel_path) {
        Some(g) => g,
        None => return,
    };

    let preset = match glob_entry.file_perms {
        Some(ref p) => p,
        None => return,
    };

    let target_path = group.target_dir.join(rel_path);
    let Ok(target_meta) = std::fs::symlink_metadata(&target_path) else {
        return;
    };
    if target_meta.is_symlink() {
        return;
    }

    let src_path = group.source_dir.join(rel_path);
    let src_perms = std::fs::symlink_metadata(&src_path)
        .map(|m| m.permissions().mode() & 0o777)
        .unwrap_or(0o644);

    let target_mode = preset.map_permissions(src_perms);
    let perms = std::fs::Permissions::from_mode(target_mode);
    if let Err(_e) = std::fs::set_permissions(&target_path, perms) {
        eprintln!(
            "Permission warning: '{}' has {:o}, should be {:o} (run as root to fix)",
            rel_path,
            target_meta.permissions().mode() & 0o777,
            target_mode
        );
        outcome.skipped_perms += 1;
    }
}

fn check_owner_feasibility(
    config: &ResolvedConfig,
    group_index: usize,
    rel_path: &str,
) -> Option<String> {
    if is_root() {
        return None;
    }
    let group = &config.sync_groups[group_index];
    let glob_entry = find_matching_glob(group, rel_path)?;
    if glob_entry.owner.is_some() {
        if let Some(ref owner_spec) = glob_entry.owner {
            return Some(format!(
                "Owner warning: '{}' should be owned by '{}' (run as root to fix)",
                rel_path, owner_spec
            ));
        }
        return Some(format!(
            "Owner warning: '{}' has a configured owner (run as root to fix)",
            rel_path
        ));
    }
    None
}

fn resolve_file_perms(path: &Path, group: &crate::config::ResolvedSyncGroup) -> String {
    use std::os::unix::fs::PermissionsExt;
    if let Ok(metadata) = std::fs::symlink_metadata(path) {
        if metadata.file_type().is_symlink() {
            return "0".to_string();
        }
        let actual_mode = metadata.permissions().mode() & 0o777;
        let src_str = path.to_string_lossy();
        for glob_entry in &group.globs {
            if glob_entry.file_perms.is_none() {
                continue;
            }
            let pattern_str = group
                .source_dir
                .join(&glob_entry.pattern)
                .to_string_lossy()
                .to_string();
            if let Ok(pattern) = glob::Pattern::new(&pattern_str)
                && pattern.matches(&src_str)
                && let Some(ref preset) = glob_entry.file_perms
            {
                return format!("{:o}", preset.map_permissions(actual_mode));
            }
        }
        return format!("{:o}", actual_mode);
    }
    "0".to_string()
}

fn resolve_file_owner(path: &Path, group: &crate::config::ResolvedSyncGroup) -> String {
    use std::os::unix::fs::MetadataExt;
    if let Ok(metadata) = std::fs::symlink_metadata(path) {
        if metadata.file_type().is_symlink() {
            return String::new();
        }
        let src_str = path.to_string_lossy();
        for glob_entry in &group.globs {
            if glob_entry.owner.is_none() {
                continue;
            }
            let pattern_str = group
                .source_dir
                .join(&glob_entry.pattern)
                .to_string_lossy()
                .to_string();
            if let Ok(pattern) = glob::Pattern::new(&pattern_str)
                && pattern.matches(&src_str)
                && let Some(ref owner_spec) = glob_entry.owner
            {
                return owner_spec.clone();
            }
        }
        let uid = metadata.uid();
        let gid = metadata.gid();
        if let (Some(user), Some(group)) = (
            nix::unistd::User::from_uid(nix::unistd::Uid::from_raw(uid))
                .ok()
                .flatten(),
            nix::unistd::Group::from_gid(nix::unistd::Gid::from_raw(gid))
                .ok()
                .flatten(),
        ) {
            return format!("{}:{}", user.name, group.name);
        }
    }
    String::new()
}

fn compute_file_hash_for_state(path: &Path) -> Option<String> {
    use xxhash_rust::xxh3::xxh3_128;

    let metadata = std::fs::symlink_metadata(path).ok()?;
    if metadata.file_type().is_symlink() {
        let target = std::fs::read_link(path).ok()?;
        let hash = xxh3_128(target.to_string_lossy().as_bytes());
        Some(format!("{:x}", hash))
    } else {
        let contents = std::fs::read(path).ok()?;
        let hash = xxh3_128(&contents);
        Some(format!("{:x}", hash))
    }
}

fn chown_state_file(state_path: &Path, config_path: &Path) {
    if !is_root() {
        return;
    }
    use std::os::unix::fs::MetadataExt;
    let config_meta = match std::fs::metadata(config_path) {
        Ok(m) => m,
        Err(_) => return,
    };
    let uid = nix::unistd::Uid::from_raw(config_meta.uid());
    let gid = nix::unistd::Gid::from_raw(config_meta.gid());
    let _ = nix::unistd::chown(state_path, Some(uid), Some(gid));
}

fn is_root() -> bool {
    unsafe { nix::libc::geteuid() == 0 }
}

fn apply_source_owner(config: &ResolvedConfig, group_index: usize, src_path: &Path) {
    if !is_root() {
        return;
    }
    let group = &config.sync_groups[group_index];
    let src_str = src_path.to_string_lossy();
    for glob_entry in &group.globs {
        if glob_entry.owner.is_none() {
            continue;
        }
        let pattern_str = group
            .source_dir
            .join(&glob_entry.pattern)
            .to_string_lossy()
            .to_string();
        if let Ok(pattern) = glob::Pattern::new(&pattern_str)
            && pattern.matches(&src_str)
            && let Err(e) = apply_chown(src_path, glob_entry.owner.as_ref().unwrap())
        {
            eprintln!("Warning: cannot chown '{}': {}", src_path.display(), e);
        }
    }
}

fn enforce_permissions_root(config: &ResolvedConfig, _state: &State) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;

    for group in &config.sync_groups {
        for glob_entry in &group.globs {
            let has_perm_requirements = glob_entry.file_perms.is_some()
                || glob_entry.dir_perms.is_some()
                || glob_entry.owner.is_some();
            if !has_perm_requirements {
                continue;
            }

            let pattern_str = group
                .target_dir
                .join(&glob_entry.pattern)
                .to_string_lossy()
                .to_string();

            let paths = match glob::glob(&pattern_str) {
                Ok(p) => p,
                Err(e) => {
                    eprintln!("Warning: invalid glob '{}': {}", pattern_str, e);
                    continue;
                }
            };

            for entry in paths {
                let abs_path = match entry {
                    Ok(p) => p,
                    Err(e) => {
                        eprintln!("Warning: glob error for '{}': {}", pattern_str, e);
                        continue;
                    }
                };

                if abs_path.is_symlink() {
                    continue;
                }

                let rel_path = match abs_path.strip_prefix(&group.target_dir) {
                    Ok(p) => p.to_string_lossy().to_string(),
                    Err(_) => continue,
                };

                if abs_path.is_file() {
                    if let Some(ref preset) = glob_entry.file_perms {
                        let src_path = group.source_dir.join(&rel_path);
                        if let Ok(src_meta) = std::fs::symlink_metadata(&src_path) {
                            let src_perms = src_meta.permissions().mode() & 0o777;
                            let target_mode = preset.map_permissions(src_perms);
                            let perms = std::fs::Permissions::from_mode(target_mode);
                            if let Err(e) = std::fs::set_permissions(&abs_path, perms) {
                                eprintln!(
                                    "Warning: cannot chmod '{}' to {:o}: {}",
                                    rel_path, target_mode, e
                                );
                            }
                        }
                    }

                    if let Some(ref owner_spec) = glob_entry.owner
                        && let Err(e) = apply_chown(&abs_path, owner_spec)
                    {
                        eprintln!(
                            "Warning: cannot chown '{}' to '{}': {}",
                            rel_path, owner_spec, e
                        );
                    }
                } else if abs_path.is_dir() {
                    warn_directory_permission_mismatch(&abs_path, &rel_path, glob_entry, group);
                }
            }
        }
    }

    Ok(())
}

fn apply_chown(path: &Path, owner_spec: &str) -> Result<(), String> {
    let (uid, gid) = resolve_owner_uid_gid(owner_spec)?;
    nix::unistd::chown(path, uid, gid).map_err(|e| format!("chown failed: {}", e))
}

fn warn_directory_permission_mismatch(
    abs_path: &Path,
    rel_path: &str,
    glob_entry: &crate::config::ResolvedGlob,
    group: &crate::config::ResolvedSyncGroup,
) {
    use std::os::unix::fs::PermissionsExt;

    let metadata = match std::fs::symlink_metadata(abs_path) {
        Ok(m) => m,
        Err(_) => return,
    };
    let actual_mode = metadata.permissions().mode() & 0o777;

    if let Some(ref preset) = glob_entry.dir_perms {
        let src_path = group.source_dir.join(rel_path);
        let src_perms = std::fs::symlink_metadata(&src_path)
            .map(|m| m.permissions().mode() & 0o777)
            .unwrap_or(0o755);
        let expected_mode = preset.map_permissions(src_perms);
        if actual_mode != expected_mode {
            eprintln!(
                "Warning: directory '{}' has {:o}, expected {:o} (existing directories are not modified)",
                rel_path, actual_mode, expected_mode
            );
        }
    }

    if let Some(ref owner_spec) = glob_entry.owner
        && !owner_spec_matches(&metadata, owner_spec)
    {
        eprintln!(
            "Warning: directory '{}' is owned by {}, expected '{}' (existing directories are not modified)",
            rel_path,
            format_actual_owner(&metadata),
            owner_spec
        );
    }
}

fn owner_spec_matches(metadata: &std::fs::Metadata, owner_spec: &str) -> bool {
    use std::os::unix::fs::MetadataExt;
    let Ok((uid, gid)) = resolve_owner_uid_gid(owner_spec) else {
        return false;
    };
    let actual_uid = metadata.uid();
    let actual_gid = metadata.gid();
    let uid_ok = uid.map(|u| u.as_raw() == actual_uid).unwrap_or(true);
    let gid_ok = gid.map(|g| g.as_raw() == actual_gid).unwrap_or(true);
    uid_ok && gid_ok
}

fn format_actual_owner(metadata: &std::fs::Metadata) -> String {
    use std::os::unix::fs::MetadataExt;
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

fn resolve_owner_uid_gid(
    owner_spec: &str,
) -> Result<(Option<nix::unistd::Uid>, Option<nix::unistd::Gid>), String> {
    let parts: Vec<&str> = owner_spec.split(':').collect();
    if parts.len() != 2 {
        return Err(format!(
            "Invalid owner format '{}' (expected 'user:group')",
            owner_spec
        ));
    }
    let user_name = parts[0];
    let group_name = parts[1];
    if user_name.is_empty() || group_name.is_empty() {
        return Err(format!(
            "Invalid owner format '{}' (expected 'user:group')",
            owner_spec
        ));
    }

    let uid = if let Some(user) = nix::unistd::User::from_name(user_name)
        .map_err(|e| format!("Cannot look up user '{}': {}", user_name, e))?
    {
        Some(user.uid)
    } else {
        return Err(format!("User '{}' not found", user_name));
    };

    let gid = if let Some(group) = nix::unistd::Group::from_name(group_name)
        .map_err(|e| format!("Cannot look up group '{}': {}", group_name, e))?
    {
        Some(group.gid)
    } else {
        return Err(format!("Group '{}' not found", group_name));
    };

    Ok((uid, gid))
}

fn check_deviating_directories(config: &ResolvedConfig) {
    for group in &config.sync_groups {
        for entry in &group.deviating {
            check_one_deviating_directory(&entry.path, &entry.owner);
        }
    }
}

fn check_one_deviating_directory(dir_path: &Path, expected_owner: &Option<String>) {
    let metadata = match std::fs::symlink_metadata(dir_path) {
        Ok(m) => m,
        Err(_) => {
            eprintln!(
                "Warning: deviating directory '{}' does not exist",
                dir_path.display()
            );
            return;
        }
    };

    if !metadata.is_dir() {
        eprintln!(
            "Warning: deviating path '{}' is not a directory",
            dir_path.display()
        );
        return;
    }

    if let Some(owner_spec) = expected_owner
        && !owner_spec_matches(&metadata, owner_spec)
    {
        eprintln!(
            "Warning: deviating directory '{}' is owned by {}, expected '{}' (existing directories are not modified)",
            dir_path.display(),
            format_actual_owner(&metadata),
            owner_spec
        );
    }
}

fn run_hook_for_group(
    config: &ResolvedConfig,
    group_index: usize,
    dry_run: bool,
    outcome: &mut SyncOutcome,
) -> Result<(), String> {
    let group = &config.sync_groups[group_index];
    let hook_cmd = match &group.hook_after {
        Some(cmd) if !cmd.trim().is_empty() => cmd.trim(),
        _ => return Ok(()),
    };

    if dry_run {
        println!("[dry-run] would run hook: {}", hook_cmd);
        return Ok(());
    }

    if !is_root()
        && let Some(ref owner) = group.owner
    {
        eprintln!(
            "Warning: skipping hook for sync group {} (owner '{}' requires root)",
            group_index + 1,
            owner
        );
        return Ok(());
    }

    println!("running hook: {}", hook_cmd);

    match execute_hook(hook_cmd, config, group) {
        Ok(()) => {}
        Err(e) => {
            eprintln!("Warning: hook '{}': {}", hook_cmd, e);
            outcome.hook_failures += 1;
        }
    }

    Ok(())
}

fn execute_hook(
    hook_cmd: &str,
    config: &ResolvedConfig,
    group: &crate::config::ResolvedSyncGroup,
) -> Result<(), String> {
    use std::os::unix::process::CommandExt;

    let mut cmd = std::process::Command::new("/bin/sh");
    cmd.arg("-c").arg(hook_cmd);

    let work_dir = if config.config_dir.as_os_str().is_empty() {
        std::env::current_dir().map_err(|e| format!("Cannot get current directory: {}", e))?
    } else {
        config.config_dir.canonicalize().map_err(|e| {
            format!(
                "Cannot resolve config directory '{}': {}",
                config.config_dir.display(),
                e
            )
        })?
    };
    cmd.current_dir(&work_dir);

    if is_root() {
        let (uid, gid) = if let Some(ref owner_spec) = group.owner {
            resolve_owner_uid_gid(owner_spec)?
        } else {
            let metadata = std::fs::metadata(&config.config_path)
                .map_err(|e| format!("Cannot stat config file: {}", e))?;
            use std::os::unix::fs::MetadataExt;
            let uid = nix::unistd::Uid::from_raw(metadata.uid());
            let gid = nix::unistd::Gid::from_raw(metadata.gid());
            (Some(uid), Some(gid))
        };

        if let Some(uid) = uid {
            cmd.uid(uid.as_raw());
        }
        if let Some(gid) = gid {
            cmd.gid(gid.as_raw());
        }
    }

    let status = cmd
        .status()
        .map_err(|e| format!("failed to execute: {}", e))?;
    if !status.success() {
        if let Some(code) = status.code() {
            return Err(format!("exited with code {}", code));
        } else {
            return Err("terminated by signal".to_string());
        }
    }
    Ok(())
}

fn eprint_diff(src: &Path, tgt: &Path) {
    let read = |p: &Path| -> String {
        let mut f = match std::fs::File::open(p) {
            Ok(f) => f,
            Err(_) => return "(file missing)".to_string(),
        };
        let mut buf = String::new();
        f.read_to_string(&mut buf).unwrap_or_default();
        buf
    };

    let source_content = read(src);
    let target_content = read(tgt);

    let diff = TextDiff::from_lines(&target_content, &source_content);
    let udiff = diff.unified_diff();

    let mut output = String::new();
    for change in udiff.iter_hunks() {
        output.push_str(&format!("{}", change));
    }

    if output.is_empty() {
        eprintln!("  (files are identical)");
    } else {
        eprint!("{}", output);
    }
}

fn prompt_user(_src: &Path, _tgt: &Path) -> Result<String, String> {
    use std::io::Write;

    eprint!("\nOverwrite [t]arget   Overwrite [s]ource   [x]skip  [q]uit: ");
    std::io::stderr()
        .flush()
        .map_err(|e| format!("flush: {}", e))?;

    let mut input = String::new();
    std::io::stdin()
        .read_line(&mut input)
        .map_err(|e| format!("read: {}", e))?;

    Ok(input.trim().to_lowercase())
}

fn config_owned_by_root(config_path: &Path) -> bool {
    use std::os::unix::fs::MetadataExt;
    match std::fs::metadata(config_path) {
        Ok(m) => m.uid() == 0,
        Err(_) => false,
    }
}

fn config_only_writable_by_owner(config_path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    match std::fs::metadata(config_path) {
        Ok(m) => m.permissions().mode() & 0o022 == 0,
        Err(_) => false,
    }
}

fn security_bypass(config: &ResolvedConfig) -> bool {
    if !is_root() {
        return true;
    }
    config_owned_by_root(&config.config_path) && config_only_writable_by_owner(&config.config_path)
}

fn config_file_uid(config_path: &Path) -> u32 {
    use std::os::unix::fs::MetadataExt;
    match std::fs::metadata(config_path) {
        Ok(m) => m.uid(),
        Err(_) => 0,
    }
}

fn can_write(config_uid: u32, config_gid: u32, path_uid: u32, path_gid: u32, mode: u32) -> bool {
    if path_uid == config_uid {
        (mode & 0o200) != 0
    } else if path_gid == config_gid {
        (mode & 0o020) != 0
    } else {
        (mode & 0o002) != 0
    }
}

fn config_owner_can_touch(config_path: &Path, target_path: &Path) -> bool {
    use std::os::unix::fs::{MetadataExt, PermissionsExt};
    let config_meta = match std::fs::metadata(config_path) {
        Ok(m) => m,
        Err(_) => return false,
    };
    let config_uid = config_meta.uid();
    let config_gid = config_meta.gid();

    if let Some(parent) = target_path.parent()
        && let Ok(parent_meta) = std::fs::metadata(parent)
        && !can_write(
            config_uid,
            config_gid,
            parent_meta.uid(),
            parent_meta.gid(),
            parent_meta.permissions().mode(),
        )
    {
        return false;
    }

    if let Ok(file_meta) = std::fs::metadata(target_path) {
        can_write(
            config_uid,
            config_gid,
            file_meta.uid(),
            file_meta.gid(),
            file_meta.permissions().mode(),
        )
    } else {
        true
    }
}

fn config_owner_can_delete(config_path: &Path, target_path: &Path) -> bool {
    use std::os::unix::fs::{MetadataExt, PermissionsExt};
    let config_meta = match std::fs::metadata(config_path) {
        Ok(m) => m,
        Err(_) => return false,
    };
    let config_uid = config_meta.uid();
    let config_gid = config_meta.gid();

    if let Some(parent) = target_path.parent()
        && let Ok(parent_meta) = std::fs::metadata(parent)
    {
        return can_write(
            config_uid,
            config_gid,
            parent_meta.uid(),
            parent_meta.gid(),
            parent_meta.permissions().mode(),
        );
    }
    false
}

enum SecurityAction {
    None,
    ErrorSkip,
}

fn security_action(
    config: &ResolvedConfig,
    group_index: usize,
    target_path: &Path,
    is_delete: bool,
) -> SecurityAction {
    let config_path = &config.config_path;

    let group = &config.sync_groups[group_index];
    let has_owner = group.owner.is_some();

    if has_owner {
        return SecurityAction::None;
    }

    let needs_privilege = if is_delete {
        !config_owner_can_delete(config_path, target_path)
    } else {
        !config_owner_can_touch(config_path, target_path)
    };

    if !needs_privilege {
        return SecurityAction::None;
    }

    SecurityAction::ErrorSkip
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_copy_file_preserves_mtime() {
        let dir = tempfile::TempDir::new().unwrap();
        let src = dir.path().join("src.txt");
        let dst = dir.path().join("dst.txt");

        std::fs::write(&src, "hello world").unwrap();
        let (src_mtime, _, _) = file_attrs(&src);

        copy_file(&src, &dst).unwrap();

        let (dst_mtime, _, _) = file_attrs(&dst);
        assert_eq!(src_mtime, dst_mtime);
        assert_eq!(std::fs::read_to_string(&dst).unwrap(), "hello world");
    }

    #[test]
    fn test_copy_file_creates_parent_dirs() {
        let dir = tempfile::TempDir::new().unwrap();
        let src = dir.path().join("src.txt");
        let dst = dir.path().join("sub").join("nested").join("dst.txt");

        std::fs::write(&src, "test").unwrap();
        copy_file(&src, &dst).unwrap();

        assert!(dst.exists());
    }

    #[test]
    fn test_is_root_returns_bool() {
        assert!(!is_root());
    }

    #[test]
    fn test_file_attrs_nonexistent() {
        let path = Path::new("/does/not/exist");
        assert_eq!(file_attrs(path), (0, false, None));
    }

    #[test]
    fn test_execute_hook_true() {
        let dir = tempfile::TempDir::new().unwrap();
        let config = make_minimal_config(&dir);
        let group = make_minimal_group_no_owner(&dir);
        let result = execute_hook("/bin/true", &config, &group);
        assert!(result.is_ok());
    }

    #[test]
    fn test_execute_hook_false() {
        let dir = tempfile::TempDir::new().unwrap();
        let config = make_minimal_config(&dir);
        let group = make_minimal_group_no_owner(&dir);
        let result = execute_hook("/bin/false", &config, &group);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("exited with code"));
    }

    #[test]
    fn test_execute_hook_nonexistent_command() {
        let dir = tempfile::TempDir::new().unwrap();
        let config = make_minimal_config(&dir);
        let group = make_minimal_group_no_owner(&dir);
        let result = execute_hook("/nonexistent/command_xyz_123", &config, &group);
        assert!(result.is_err());
    }

    #[test]
    fn test_run_hook_skipped_when_nonroot_with_owner() {
        let dir = tempfile::TempDir::new().unwrap();
        let config = make_minimal_config(&dir);
        let mut group = make_minimal_group_no_owner(&dir);
        group.owner = Some("root:root".to_string());
        group.hook_after = Some("touch /should/not/be/created".to_string());

        let resolved = ResolvedConfig {
            sync_groups: vec![group],
            ..config
        };

        let mut outcome = SyncOutcome {
            copied_to_target: 0,
            copied_to_source: 0,
            deleted_from_target: 0,
            deleted_from_source: 0,
            skipped_perms: 0,
            conflicts_total: 0,
            conflicts_resolved: 0,
            updated_state: 0,
            hook_failures: 0,
        };

        let _ = run_hook_for_group(&resolved, 0, false, &mut outcome);
        assert_eq!(outcome.hook_failures, 0);
    }

    fn make_minimal_config(dir: &tempfile::TempDir) -> ResolvedConfig {
        let config_path = dir.path().join("config.toml");
        std::fs::write(&config_path, "").unwrap();
        ResolvedConfig {
            config_dir: dir.path().to_path_buf(),
            config_path,
            sync_groups: vec![],
            state_path: dir.path().join("state"),
        }
    }

    fn make_minimal_group_no_owner(dir: &tempfile::TempDir) -> crate::config::ResolvedSyncGroup {
        let src = dir.path().join("source");
        let tgt = dir.path().join("target");
        std::fs::create_dir(&src).ok();
        std::fs::create_dir(&tgt).ok();
        crate::config::ResolvedSyncGroup {
            source_dir: src,
            target_dir: tgt,
            globs: vec![],
            file_perms: None,
            dir_perms: None,
            owner: None,
            deviating: vec![],
            hook_after: None,
        }
    }
}
