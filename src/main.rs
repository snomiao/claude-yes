use anyhow::Result;
use clap::Parser;
use humantime::Duration as HumanDuration;
use std::time::Duration;
use tracing::{error, info};

mod claude_wrapper;
mod idle_watcher;
mod ready_manager;
mod terminal_render;
mod utils;

use claude_wrapper::ClaudeWrapper;

#[derive(Parser, Debug)]
#[command(
    name = "claude-yes",
    version,
    about = "A wrapper tool that automates interactions with the Claude CLI",
    long_about = "A wrapper tool that automates interactions with the Claude CLI by automatically handling common prompts and responses"
)]
struct Args {
    /// Exit after being idle for specified duration (e.g., "60s", "5m")
    #[arg(long, default_value = "60s")]
    exit_on_idle: String,

    /// Continue running even if Claude crashes
    #[arg(long, default_value_t = true)]
    continue_on_crash: bool,

    /// Path to log file for output logging
    #[arg(long)]
    log_file: Option<String>,

    /// Enable verbose logging
    #[arg(short, long, default_value_t = false)]
    verbose: bool,

    /// Remove ANSI control characters from stdout
    #[arg(long, default_value_t = false)]
    remove_control_characters_from_stdout: bool,

    /// Additional arguments to pass to the Claude CLI
    #[arg(trailing_var_arg = true)]
    claude_args: Vec<String>,
}

fn parse_duration_string(s: &str) -> Result<Option<Duration>> {
    if s == "0" || s == "false" {
        return Ok(None);
    }
    match s.parse::<HumanDuration>() {
        Ok(duration) => Ok(Some(duration.into())),
        Err(e) => anyhow::bail!("Invalid duration '{}': {}", s, e)
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    // Set up panic handler to disable raw mode on panic
    std::panic::set_hook(Box::new(|_| {
        let _ = crossterm::terminal::disable_raw_mode();
    }));
    let args = Args::parse();

    // Parse and validate exit_on_idle duration early
    let exit_on_idle = match parse_duration_string(&args.exit_on_idle) {
        Ok(duration) => duration,
        Err(e) => {
            eprintln!("Error: {}", e);
            std::process::exit(1);
        }
    };

    // Initialize tracing
    let log_level = if args.verbose { "debug" } else { "info" };
    tracing_subscriber::fmt()
        .with_env_filter(log_level)
        .init();

    // if args.verbose {
    //     info!("Starting claude-yes with args: {:?}", args);
    // }

    println!("⭐ Starting claude, automatically responding to yes/no prompts...");
    println!(
        "⚠️ Important Security Warning: Only run this on trusted repositories. \
         This tool automatically responds to prompts and can execute commands without user confirmation. \
         Be aware of potential prompt injection attacks where malicious code or instructions could be \
         embedded in files or user inputs to manipulate the automated responses."
    );

    // Enable raw mode for stdin to get immediate input (like TypeScript version)
    crossterm::terminal::enable_raw_mode()?;

    let config = claude_wrapper::Config {
        claude_args: args.claude_args,
        continue_on_crash: args.continue_on_crash,
        exit_on_idle,
        log_file: args.log_file,
        remove_control_characters_from_stdout: args.remove_control_characters_from_stdout,
        verbose: args.verbose,
    };

    let mut wrapper = ClaudeWrapper::new(config)?;
    let result = wrapper.run().await;

    // Disable raw mode before exiting
    let _ = crossterm::terminal::disable_raw_mode();

    match result {
        Ok(exit_code) => {
            // info!("[claude-yes] claude exited with code {:?}", exit_code);
            std::process::exit(exit_code.unwrap_or(1));
        }
        Err(e) => {
            error!("[claude-yes] Error: {}", e);
            std::process::exit(1);
        }
    }
}