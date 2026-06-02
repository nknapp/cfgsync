use crate::changes;
use crate::config;
use crate::state;
use crate::sync;

use notify::{Event, EventKind, RecursiveMode, Watcher};
use std::collections::HashSet;
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

    let watch_roots: Vec<PathBuf> = {
        let mut seen = HashSet::new();
        let mut dirs = Vec::new();
        for group in &resolved.sync_groups {
            for dir in [&group.source_dir, &group.target_dir] {
                if seen.insert(dir.clone()) {
                    dirs.push(dir.clone());
                }
            }
        }
        dirs
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

    for root in &watch_roots {
        watch_tree(&mut watcher, root)
            .map_err(|e| format!("Cannot watch '{}': {}", root.display(), e))?;
        if verbose {
            eprintln!("Watching: {}", root.display());
        }
    }

    if !dry_run {
        run_sync_cycle(&resolved, false, false, verbose, debug);
    } else {
        eprintln!("Watching in dry-run mode (no changes will be made)...");
    }

    loop {
        match rx.recv() {
            Ok(event) => {
                handle_new_directories(&mut watcher, &event);

                if verbose {
                    eprintln!("Change in {:?}", event.paths);
                }

                let deadline = Instant::now() + DEBOUNCE_DURATION;
                while Instant::now() < deadline {
                    match rx.recv_timeout(deadline - Instant::now()) {
                        Ok(event) => {
                            handle_new_directories(&mut watcher, &event);
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

                run_sync_cycle(&resolved, false, dry_run, verbose, debug);
            }
            Err(mpsc::RecvError) => {
                return Err("Watcher channel closed".to_string());
            }
        }
    }
}

fn watch_tree(watcher: &mut notify::RecommendedWatcher, dir: &Path) -> Result<(), notify::Error> {
    if !dir.is_dir() {
        return Ok(());
    }
    watcher.watch(dir, RecursiveMode::NonRecursive)?;
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() && !path.is_symlink() {
                watch_tree(watcher, &path)?;
            }
        }
    }
    Ok(())
}

fn handle_new_directories(watcher: &mut notify::RecommendedWatcher, event: &Event) {
    for path in &event.paths {
        if path.is_dir() {
            let _ = watch_tree(watcher, path);
        }
    }
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
