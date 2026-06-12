mod changes;
mod config;
mod diff;
mod schema;
mod state;
mod status;
mod sync;
mod watch;

use clap::{Parser, Subcommand};
use std::path::PathBuf;
use std::process;

#[derive(Parser)]
#[command(name = "cfgsync", about = "Bidirectional config file sync", version)]
struct Cli {
    /// Show verbose output
    #[arg(short, long, global = true)]
    verbose: bool,

    /// Show detailed debug output (implies --verbose)
    #[arg(long, global = true)]
    debug: bool,

    /// Path to the configuration file
    #[arg(long, global = true)]
    config: Option<PathBuf>,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Perform bidirectional sync
    Sync {
        /// Resolve conflicts interactively
        #[arg(short, long)]
        interactive: bool,
        /// Show what would be done without making changes
        #[arg(long)]
        dry_run: bool,
        /// Watch files and re-sync on changes
        #[arg(short = 'w', long)]
        watch: bool,
    },
    /// Show number of changed files in each direction
    Status {
        /// Use compact output format
        #[arg(short, long)]
        short: bool,
    },
    /// Show diff for each changed file
    Diff,
    /// Print configuration file schema and example
    Schema {
        /// Output JSON Schema instead of human-readable TOML reference
        #[arg(long)]
        json: bool,
    },
}

fn require_config(config: &Option<PathBuf>, cmd_name: &str) -> PathBuf {
    match config {
        Some(c) => c.clone(),
        None => {
            eprintln!(
                "Error: 'cfgsync --config <path> {}' requires a configuration file.",
                cmd_name
            );
            process::exit(1);
        }
    }
}

fn main() {
    let cli = Cli::parse();

    match &cli.command {
        Commands::Sync {
            interactive,
            dry_run,
            watch,
        } => cmd_sync(
            require_config(&cli.config, "sync"),
            *interactive,
            *dry_run,
            *watch,
            cli.verbose,
            cli.debug,
        ),
        Commands::Status { short } => cmd_status(
            require_config(&cli.config, "status"),
            *short,
            cli.verbose,
            cli.debug,
        ),
        Commands::Diff => cmd_diff(require_config(&cli.config, "diff"), cli.verbose, cli.debug),
        Commands::Schema { json } => schema::print_schema(*json),
    }
}

fn cmd_sync(
    config_path: PathBuf,
    interactive: bool,
    dry_run: bool,
    watch: bool,
    verbose: bool,
    debug: bool,
) {
    if watch {
        if let Err(e) = watch::watch_and_sync(&config_path, interactive, dry_run, verbose, debug) {
            eprintln!("Error: {}", e);
            process::exit(1);
        }
        return;
    }

    let resolved = config::load_config(&config_path).unwrap_or_else(|e| {
        eprintln!("Error: {}", e);
        process::exit(1);
    });

    let mut state = state::State::load(&resolved.state_path).unwrap_or_else(|e| {
        eprintln!("Error: {}", e);
        process::exit(1);
    });

    let changes =
        changes::classify(&resolved, &state, verbose || debug, debug).unwrap_or_else(|e| {
            eprintln!("Error: {}", e);
            process::exit(1);
        });

    if let Err(e) = sync::run(&resolved, &mut state, changes, interactive, dry_run) {
        eprintln!("Error: {}", e);
        process::exit(1);
    }
}

fn cmd_status(config_path: PathBuf, short: bool, verbose: bool, debug: bool) {
    let resolved = config::load_config(&config_path).unwrap_or_else(|e| {
        eprintln!("Error: {}", e);
        process::exit(1);
    });

    let state = state::State::load(&resolved.state_path).unwrap_or_else(|e| {
        eprintln!("Error: {}", e);
        process::exit(1);
    });

    let changes =
        changes::classify(&resolved, &state, verbose || debug, debug).unwrap_or_else(|e| {
            eprintln!("Error: {}", e);
            process::exit(1);
        });

    let counts = changes::count_changes(&changes);
    status::print_status(&counts, short);
}

fn cmd_diff(config_path: PathBuf, verbose: bool, debug: bool) {
    let resolved = config::load_config(&config_path).unwrap_or_else(|e| {
        eprintln!("Error: {}", e);
        process::exit(1);
    });

    let state = state::State::load(&resolved.state_path).unwrap_or_else(|e| {
        eprintln!("Error: {}", e);
        process::exit(1);
    });

    let changes =
        changes::classify(&resolved, &state, verbose || debug, debug).unwrap_or_else(|e| {
            eprintln!("Error: {}", e);
            process::exit(1);
        });

    diff::print_diffs(&changes);
}
