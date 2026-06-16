use crate::changes::Change;
use crate::config::ResolvedConfig;
use crate::state::{FileEntry, State};
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
    conflicts_skipped: usize,
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
        conflicts_skipped: 0,
        hook_failures: 0,
    };

    let mut groups_with_copy_to_target: HashSet<usize> = HashSet::new();

    for change in &changes {
        match change {
            Change::CopyToTarget {
                rel_path,
                abs_src,
                abs_tgt,
                group_index,
                ..
            } if !interactive => {
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
                rel_path, abs_tgt, ..
            } if !interactive => {
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

            Change::Cleanup { .. } => {}

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
                            if dry_run {
                                println!("[dry-run] would copy source -> target: {}", rel_path);
                            } else {
                                match copy_file(abs_src, abs_tgt) {
                                    Ok(()) => {
                                        println!("resolved: {} (kept source)", rel_path);
                                        outcome.copied_to_target += 1;
                                        outcome.conflicts_skipped += 1;
                                        groups_with_copy_to_target.insert(*group_index);
                                    }
                                    Err(e) => {
                                        eprintln!("Warning: skipping '{}': {}", rel_path, e);
                                        outcome.skipped_perms += 1;
                                        outcome.conflicts_skipped += 1;
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
                                        outcome.conflicts_skipped += 1;
                                    }
                                    Err(e) => {
                                        eprintln!("Warning: skipping '{}': {}", rel_path, e);
                                        outcome.skipped_perms += 1;
                                        outcome.conflicts_skipped += 1;
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
                            outcome.conflicts_skipped += 1;
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
                    if dry_run {
                        println!("[dry-run] copy {} -> target", rel_path);
                    } else {
                        match copy_file(abs_src, abs_tgt) {
                            Ok(()) => {
                                println!("copied {} -> target", rel_path);
                                outcome.copied_to_target += 1;
                                groups_with_copy_to_target.insert(*group_index);
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
                    rel_path, abs_tgt, ..
                } => {
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

                Change::Cleanup { .. } => {}
            }
        }
    }

    if !dry_run {
        // Enforce permissions/owner on target files
        if is_root() {
            enforce_permissions_root(config, state)?;
        } else {
            check_permissions_nonroot(config, &mut outcome);
        }

        // Run hooks for groups that had files copied to target
        for &group_index in &groups_with_copy_to_target {
            run_hook_for_group(config, group_index, false, &mut outcome);
        }

        // Rebuild state from current filesystem
        update_state(config, state);
        state.save(&config.state_path)?;
        chown_state_file(&config.state_path, &config.config_path);
    } else {
        for &group_index in &groups_with_copy_to_target {
            run_hook_for_group(config, group_index, true, &mut outcome);
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
        if outcome.conflicts_skipped > 0 {
            println!("  resolved:       {}", outcome.conflicts_skipped);
            println!(
                "  skipped:        {}",
                outcome.conflicts_total - outcome.conflicts_skipped
            );
        }
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

    if src.is_symlink() {
        let target = std::fs::read_link(src)
            .map_err(|e| format!("Cannot read symlink target for '{}': {}", src.display(), e))?;
        if dst.exists() {
            std::fs::remove_file(dst).map_err(|e| {
                format!(
                    "Cannot remove existing file '{}' before creating symlink: {}",
                    dst.display(),
                    e
                )
            })?;
        }
        std::os::unix::fs::symlink(&target, dst).map_err(|e| {
            format!(
                "Cannot create symlink '{}' -> '{}': {}",
                dst.display(),
                target.display(),
                e
            )
        })?;
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

fn update_state(config: &ResolvedConfig, state: &mut State) {
    state.last_sync = chrono::Utc::now();
    state.file.clear();

    let mut seen = std::collections::HashSet::new();

    for (group_index, group) in config.sync_groups.iter().enumerate() {
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

                let (src_mtime, is_symlink, symlink_target) = file_attrs(&abs_path);
                let tgt_path = group.target_dir.join(&rel_path);
                let (tgt_mtime, _, _) = file_attrs(&tgt_path);

                if src_mtime > 0 || tgt_mtime > 0 || is_symlink {
                    state.file.push(FileEntry {
                        group_index,
                        path: rel_path,
                        source_mtime: src_mtime,
                        target_mtime: tgt_mtime,
                        is_symlink,
                        symlink_target,
                    });
                }
            }
        }
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
        .map(|d| d.as_secs() as i64)
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
            let has_perm_requirements =
                glob_entry.permissions.is_some() || glob_entry.owner.is_some();
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

                if !abs_path.is_file() {
                    continue;
                }
                if abs_path.is_symlink() {
                    continue;
                }

                let rel_path = match abs_path.strip_prefix(&group.target_dir) {
                    Ok(p) => p.to_string_lossy().to_string(),
                    Err(_) => continue,
                };

                if let Some(mode) = glob_entry.permissions {
                    let perms = std::fs::Permissions::from_mode(mode);
                    if let Err(e) = std::fs::set_permissions(&abs_path, perms) {
                        eprintln!("Warning: cannot chmod '{}' to {:o}: {}", rel_path, mode, e);
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
            }
        }
    }

    Ok(())
}

fn apply_chown(path: &Path, owner_spec: &str) -> Result<(), String> {
    let (uid, gid) = resolve_owner_uid_gid(owner_spec)?;
    nix::unistd::chown(path, uid, gid).map_err(|e| format!("chown failed: {}", e))
}

fn resolve_owner_uid_gid(
    owner_spec: &str,
) -> Result<(Option<nix::unistd::Uid>, Option<nix::unistd::Gid>), String> {
    let parts: Vec<&str> = owner_spec.split(':').collect();
    if parts.len() > 2 {
        return Err(format!("Invalid owner format '{}'", owner_spec));
    }

    let user_name = parts[0];
    let group_name = if parts.len() == 2 && !parts[1].is_empty() {
        Some(parts[1])
    } else {
        None
    };

    let uid = if let Some(user) = nix::unistd::User::from_name(user_name)
        .map_err(|e| format!("Cannot look up user '{}': {}", user_name, e))?
    {
        Some(user.uid)
    } else {
        return Err(format!("User '{}' not found", user_name));
    };

    let gid = if let Some(group) = group_name {
        if let Some(group) = nix::unistd::Group::from_name(group)
            .map_err(|e| format!("Cannot look up group '{}': {}", group, e))?
        {
            Some(group.gid)
        } else {
            return Err(format!("Group '{}' not found", group));
        }
    } else {
        None
    };

    Ok((uid, gid))
}

fn check_permissions_nonroot(config: &ResolvedConfig, outcome: &mut SyncOutcome) {
    use std::os::unix::fs::{MetadataExt, PermissionsExt};

    for group in &config.sync_groups {
        for glob_entry in &group.globs {
            let has_perm_requirements =
                glob_entry.permissions.is_some() || glob_entry.owner.is_some();
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

                if !abs_path.is_file() {
                    continue;
                }
                if abs_path.is_symlink() {
                    continue;
                }

                let rel_path = match abs_path.strip_prefix(&group.target_dir) {
                    Ok(p) => p.to_string_lossy().to_string(),
                    Err(_) => continue,
                };

                if let Some(mode) = glob_entry.permissions
                    && let Ok(metadata) = std::fs::metadata(&abs_path)
                {
                    let current_mode = metadata.permissions().mode() & 0o777;
                    if current_mode != mode {
                        eprintln!(
                            "Permission warning: '{}' has 0o{:o}, should be 0o{:o} (run as root to fix)",
                            rel_path, current_mode, mode
                        );
                        outcome.skipped_perms += 1;
                    }
                }

                if let Some(ref _owner_spec) = glob_entry.owner
                    && let Ok(metadata) = std::fs::metadata(&abs_path)
                {
                    let _current_uid = metadata.uid();
                    eprintln!(
                        "Owner warning: '{}' should be owned by '{}' (run as root to fix)",
                        rel_path, _owner_spec
                    );
                    outcome.skipped_perms += 1;
                }
            }
        }
    }
}

fn run_hook_for_group(
    config: &ResolvedConfig,
    group_index: usize,
    dry_run: bool,
    outcome: &mut SyncOutcome,
) {
    let group = &config.sync_groups[group_index];
    let hook_cmd = match &group.hook_after {
        Some(cmd) if !cmd.trim().is_empty() => cmd.trim(),
        _ => return,
    };

    if dry_run {
        println!("[dry-run] would run hook: {}", hook_cmd);
        return;
    }

    if !is_root()
        && let Some(ref owner) = group.owner
    {
        eprintln!(
            "Warning: skipping hook for sync group {} (owner '{}' requires root)",
            group_index + 1,
            owner
        );
        return;
    }

    println!("running hook: {}", hook_cmd);

    match execute_hook(hook_cmd, config, group) {
        Ok(()) => {}
        Err(e) => {
            eprintln!("Warning: hook '{}': {}", hook_cmd, e);
            outcome.hook_failures += 1;
        }
    }
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
            conflicts_skipped: 0,
            hook_failures: 0,
        };

        run_hook_for_group(&resolved, 0, false, &mut outcome);
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
            permissions: None,
            owner: None,
            hook_after: None,
        }
    }
}
