mod changes;
mod config;
mod diff;
mod schema;
mod state;
mod status;
mod sync;

use clap::{Parser, Subcommand};
use std::path::Path;
use std::path::PathBuf;
use std::process;

#[derive(Parser)]
#[command(name = "cfgsync", about = "Bidirectional config file sync", version)]
struct Cli {
    /// Show verbose output
    #[arg(short, long, global = true)]
    verbose: bool,

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
        /// Use compact output format
        #[arg(short, long)]
        short: bool,
    },
    /// Show diff for each changed file
    Diff {
        /// Path to the configuration file
        config: PathBuf,
    },
    /// Print configuration file schema and example
    Schema {
        /// Output JSON Schema instead of human-readable TOML reference
        #[arg(long)]
        json: bool,
    },
}

fn main() {
    let cli = Cli::parse();

    match cli.command {
        Commands::Sync {
            config,
            interactive,
            dry_run,
        } => cmd_sync(&config, interactive, dry_run, cli.verbose),
        Commands::Status { config, short } => cmd_status(&config, short, cli.verbose),
        Commands::Diff { config } => cmd_diff(&config, cli.verbose),
        Commands::Schema { json } => schema::print_schema(json),
    }
}

fn cmd_sync(config_path: &Path, interactive: bool, dry_run: bool, verbose: bool) {
    let resolved = config::load_config(config_path).unwrap_or_else(|e| {
        eprintln!("Error: {}", e);
        process::exit(1);
    });

    let mut state = state::State::load(&resolved.state_path).unwrap_or_else(|e| {
        eprintln!("Error: {}", e);
        process::exit(1);
    });

    let changes = changes::classify(&resolved, &state, verbose).unwrap_or_else(|e| {
        eprintln!("Error: {}", e);
        process::exit(1);
    });

    if let Err(e) = sync::run(&resolved, &mut state, changes, interactive, dry_run) {
        eprintln!("Error: {}", e);
        process::exit(1);
    }
}

fn cmd_status(config_path: &Path, short: bool, verbose: bool) {
    let resolved = config::load_config(config_path).unwrap_or_else(|e| {
        eprintln!("Error: {}", e);
        process::exit(1);
    });

    let state = state::State::load(&resolved.state_path).unwrap_or_else(|e| {
        eprintln!("Error: {}", e);
        process::exit(1);
    });

    let changes = changes::classify(&resolved, &state, verbose).unwrap_or_else(|e| {
        eprintln!("Error: {}", e);
        process::exit(1);
    });

    let counts = changes::count_changes(&changes);
    status::print_status(&counts, short);
}

fn cmd_diff(config_path: &Path, verbose: bool) {
    let resolved = config::load_config(config_path).unwrap_or_else(|e| {
        eprintln!("Error: {}", e);
        process::exit(1);
    });

    let state = state::State::load(&resolved.state_path).unwrap_or_else(|e| {
        eprintln!("Error: {}", e);
        process::exit(1);
    });

    let changes = changes::classify(&resolved, &state, verbose).unwrap_or_else(|e| {
        eprintln!("Error: {}", e);
        process::exit(1);
    });

    diff::print_diffs(&changes);
}
