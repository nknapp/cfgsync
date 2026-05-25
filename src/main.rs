mod changes;
mod config;
mod diff;
mod state;
mod status;
mod sync;

use clap::{Parser, Subcommand};
use std::path::Path;
use std::path::PathBuf;
use std::process;

#[derive(Parser)]
#[command(name = "cfgsync", about = "Bidirectional config file sync")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Perform bidirectional sync
    Sync {
        /// Path to the configuration file
        config: PathBuf,
        /// Resolve conflicts interactively
        #[arg(short, long)]
        interactive: bool,
        /// Show what would be done without making changes
        #[arg(long)]
        dry_run: bool,
    },
    /// Show number of changed files in each direction
    Status {
        /// Path to the configuration file
        config: PathBuf,
    },
    /// Show diff for each changed file
    Diff {
        /// Path to the configuration file
        config: PathBuf,
    },
}

fn main() {
    let cli = Cli::parse();

    match cli.command {
        Commands::Sync {
            config,
            interactive,
            dry_run,
        } => cmd_sync(&config, interactive, dry_run),
        Commands::Status { config } => cmd_status(&config),
        Commands::Diff { config } => cmd_diff(&config),
    }
}

fn cmd_sync(config_path: &Path, interactive: bool, dry_run: bool) {
    let resolved = config::load_config(config_path).unwrap_or_else(|e| {
        eprintln!("Error: {}", e);
        process::exit(1);
    });

    let mut state = state::State::load(&resolved.state_path).unwrap_or_else(|e| {
        eprintln!("Error: {}", e);
        process::exit(1);
    });

    let changes = changes::classify(&resolved, &state).unwrap_or_else(|e| {
        eprintln!("Error: {}", e);
        process::exit(1);
    });

    if let Err(e) = sync::run(&resolved, &mut state, changes, interactive, dry_run) {
        eprintln!("Error: {}", e);
        process::exit(1);
    }
}

fn cmd_status(config_path: &Path) {
    let resolved = config::load_config(config_path).unwrap_or_else(|e| {
        eprintln!("Error: {}", e);
        process::exit(1);
    });

    let state = state::State::load(&resolved.state_path).unwrap_or_else(|e| {
        eprintln!("Error: {}", e);
        process::exit(1);
    });

    let changes = changes::classify(&resolved, &state).unwrap_or_else(|e| {
        eprintln!("Error: {}", e);
        process::exit(1);
    });

    let counts = changes::count_changes(&changes);
    status::print_status(&counts);
}

fn cmd_diff(config_path: &Path) {
    let resolved = config::load_config(config_path).unwrap_or_else(|e| {
        eprintln!("Error: {}", e);
        process::exit(1);
    });

    let state = state::State::load(&resolved.state_path).unwrap_or_else(|e| {
        eprintln!("Error: {}", e);
        process::exit(1);
    });

    let changes = changes::classify(&resolved, &state).unwrap_or_else(|e| {
        eprintln!("Error: {}", e);
        process::exit(1);
    });

    diff::print_diffs(&changes);
}
