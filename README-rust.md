# Claude-Yes (Rust Implementation)

A Rust port of the claude-yes tool that automates interactions with the Claude CLI by automatically handling common prompts and responses.

## Features

- Automatic response to yes/no prompts
- Idle detection with configurable timeout
- Auto-restart on crash with continuation support
- Terminal output rendering and logging
- ANSI control character filtering

## Building

```bash
cd rs
cargo build --release
```

## Testing

Run all tests:

```bash
cd rs
cargo test
```

Run specific test types:

```bash
# Unit tests only
cargo test --lib

# Integration tests only
cargo test --test integration_test

# Run tests with output
cargo test -- --nocapture

# Run a specific test
cargo test test_binary_help

# Run tests in release mode
cargo test --release
```

## Usage

```bash
./target/release/claude-yes [OPTIONS] [-- CLAUDE_ARGS...]
```

### Options

- `--exit-on-idle <DURATION>` - Exit after being idle for specified duration (default: 60s)
- `--continue-on-crash` - Continue running even if Claude crashes (default: true)
- `--log-file <PATH>` - Path to log file for output logging
- `-v, --verbose` - Enable verbose logging
- `--remove-control-characters-from-stdout` - Remove ANSI control characters from stdout

### Examples

Run Claude with a 30-second idle timeout:

```bash
./target/release/claude-yes --exit-on-idle 30s
```

Run Claude with crash recovery disabled:

```bash
./target/release/claude-yes --continue-on-crash false
```

Pass arguments to Claude:

```bash
./target/release/claude-yes -- "help me solve all todos in my codebase"
```

## Architecture

The Rust implementation consists of several modules:

- `claude_wrapper.rs` - Main wrapper handling PTY creation and process management
- `idle_watcher.rs` - Monitors Claude activity and triggers exit on idle
- `ready_manager.rs` - Manages shell readiness state for input buffering
- `terminal_render.rs` - Captures and renders terminal output
- `utils.rs` - Utility functions for ANSI control character removal

## Dependencies

- `tokio` - Async runtime
- `portable-pty` - Cross-platform PTY handling
- `crossterm` - Terminal manipulation
- `clap` - Command-line argument parsing
- `humantime` - Human-readable duration parsing
- `anyhow` - Error handling
- `tracing` - Logging framework

## Security Warning

⚠️ Only run this tool on trusted repositories. This tool automatically responds to prompts and can execute commands without user confirmation. Be aware of potential prompt injection attacks where malicious code or instructions could be embedded in files or user inputs to manipulate the automated responses.
