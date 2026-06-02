use crate::changes;
use crate::config::{self, ResolvedGlob};
use crate::state;
use crate::sync;

use notify::{Event, EventKind, RecursiveMode, Watcher};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::{Duration, Instant};

const DEBOUNCE_DURATION: Duration = Duration::from_secs(1);

pub fn watch_and_sync(
    config_path: &Path,
    interactive: bool,
    dry_run: bool,
    verbose: bool,
    debug: bool,
) -> Result<(), String> {
    if interactive {
        return Err("--interactive and --watch cannot be used together".to_string());
    }

    let resolved = config::load_config(config_path)?;

    let dir_globs: HashMap<PathBuf, Vec<ResolvedGlob>> = {
        let mut map: HashMap<PathBuf, Vec<ResolvedGlob>> = HashMap::new();
        for group in &resolved.sync_groups {
            for dir in [&group.source_dir, &group.target_dir] {
                map.entry(dir.clone())
                    .or_default()
                    .extend(group.globs.clone());
            }
        }
        map
    };

    let (tx, rx) = mpsc::channel();
    let mut watcher =
        notify::recommended_watcher(move |res: Result<Event, notify::Error>| match res {
            Ok(event) => {
                let relevant = !matches!(event.kind, EventKind::Access(_) | EventKind::Other);
                if relevant {
                    let _ = tx.send(event);
                }
            }
            Err(e) => {
                eprintln!("Watch error: {}", e);
            }
        })
        .map_err(|e| format!("Cannot create file watcher: {}", e))?;

    for (root, globs) in &dir_globs {
        watch_tree(&mut watcher, root, root, globs);
        if verbose {
            eprintln!("Watching: {}", root.display());
        }
    }

    if !dry_run {
        eprintln!("Running initial sync!");
        run_sync_cycle(&resolved, false, false, verbose, debug);
        eprintln!("Done!")
    } else {
        eprintln!("Watching in dry-run mode (no changes will be made)...");
    }

    loop {
        match rx.recv() {
            Ok(event) => {
                handle_new_directories(&mut watcher, &event, &dir_globs);

                if verbose {
                    eprintln!("Change in {:?}", event.paths);
                }

                let deadline = Instant::now() + DEBOUNCE_DURATION;
                while Instant::now() < deadline {
                    match rx.recv_timeout(deadline - Instant::now()) {
                        Ok(event) => {
                            handle_new_directories(&mut watcher, &event, &dir_globs);
                            if verbose {
                                eprintln!("Change in {:?}", event.paths);
                            }
                        }
                        Err(mpsc::RecvTimeoutError::Timeout) => break,
                        Err(mpsc::RecvTimeoutError::Disconnected) => {
                            return Err("Watcher disconnected".to_string());
                        }
                    }
                }

                eprintln!("Changes detected!");
                run_sync_cycle(&resolved, false, dry_run, verbose, debug);
            }
            Err(mpsc::RecvError) => {
                return Err("Watcher channel closed".to_string());
            }
        }
    }
}

fn watch_tree(
    watcher: &mut notify::RecommendedWatcher,
    dir: &Path,
    base_dir: &Path,
    globs: &[ResolvedGlob],
) {
    if !dir.is_dir() {
        return;
    }
    match watcher.watch(dir, RecursiveMode::NonRecursive) {
        Ok(()) => {}
        Err(e) => {
            eprintln!("Watch: cannot watch '{}': {} (skipping)", dir.display(), e);
            return;
        }
    }
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir()
                && !path.is_symlink()
                && let Ok(rel) = path.strip_prefix(base_dir)
            {
                let rel_str = rel.to_string_lossy();
                if should_watch_dir(&rel_str, globs) {
                    watch_tree(watcher, &path, base_dir, globs);
                }
            }
        }
    }
}

fn handle_new_directories(
    watcher: &mut notify::RecommendedWatcher,
    event: &Event,
    dir_globs: &HashMap<PathBuf, Vec<ResolvedGlob>>,
) {
    for path in &event.paths {
        if path.is_dir() {
            for (base_dir, globs) in dir_globs {
                if let Ok(rel) = path.strip_prefix(base_dir) {
                    let rel_str = rel.to_string_lossy();
                    if should_watch_dir(&rel_str, globs) {
                        watch_tree(watcher, path, base_dir, globs);
                    }
                    break;
                }
            }
        }
    }
}

fn extract_static_prefix(pattern: &str) -> String {
    let mut prefix = String::new();
    for ch in pattern.chars() {
        if ch == '*' || ch == '?' || ch == '[' {
            if let Some(last_slash) = prefix.rfind('/') {
                prefix.truncate(last_slash + 1);
            } else {
                prefix.clear();
            }
            return prefix;
        }
        prefix.push(ch);
    }
    if let Some(last_slash) = prefix.rfind('/') {
        prefix.truncate(last_slash + 1);
    } else {
        prefix.clear();
    }
    prefix
}

fn should_watch_dir(rel_path: &str, globs: &[ResolvedGlob]) -> bool {
    if rel_path.is_empty() {
        return true;
    }
    let rel_with_slash = if rel_path.ends_with('/') {
        rel_path.to_string()
    } else {
        format!("{}/", rel_path)
    };
    for glob in globs {
        let prefix = extract_static_prefix(&glob.pattern);
        if prefix.is_empty() {
            if glob.pattern.starts_with("**") {
                return true;
            }
            continue;
        }
        let prefix_with_slash = format!("{}/", prefix.trim_end_matches('/'));
        if prefix_with_slash.starts_with(&rel_with_slash) {
            return true;
        }
        if glob.pattern.contains("**") && rel_with_slash.starts_with(&prefix_with_slash) {
            return true;
        }
    }
    false
}

fn run_sync_cycle(
    config: &config::ResolvedConfig,
    interactive: bool,
    dry_run: bool,
    verbose: bool,
    debug: bool,
) {
    let mut state = match state::State::load(&config.state_path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Watch: error loading state: {}", e);
            return;
        }
    };

    let changes = match changes::classify(config, &state, verbose || debug, debug) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Watch: error classifying changes: {}", e);
            return;
        }
    };

    if changes.is_empty() {
        return;
    }

    let counts = changes::count_changes(&changes);
    eprintln!(
        "source -> target: {}  target -> source: {}  deleted target: {}  deleted source: {}  conflicts: {}",
        counts.copy_to_target,
        counts.copy_to_source,
        counts.delete_target,
        counts.delete_source,
        counts.conflicts,
    );

    if let Err(e) = sync::run(config, &mut state, changes, interactive, dry_run) {
        eprintln!("Watch: sync warning: {}", e);
    }
}
