use std::process::Command;
use std::time::{Duration, Instant};

#[test]
#[ignore] // This test may hang if claude is installed and starts successfully
fn test_exit_on_idle_without_claude() {
    // This test verifies that claude-yes exits properly on idle timeout
    // even when claude CLI is not available or doesn't respond

    let binary_path = if cfg!(debug_assertions) {
        "./target/debug/claude-yes"
    } else {
        "./target/release/claude-yes"
    };

    let start = Instant::now();

    // Run with a very short idle timeout
    let output = Command::new(binary_path)
        .args(&["--exit-on-idle", "1s", "--", "test command"])
        .output()
        .expect("Failed to execute claude-yes");

    let elapsed = start.elapsed();

    // It should exit within a reasonable time (allowing some buffer)
    assert!(
        elapsed < Duration::from_secs(10),
        "Process took too long to exit: {:?}",
        elapsed
    );

    // The process should exit with non-zero status since claude is likely not installed
    // or the command is invalid
    assert!(!output.status.success(), "Process should fail when claude is not available");
}

#[test]
fn test_continue_on_crash_flag() {
    let binary_path = if cfg!(debug_assertions) {
        "./target/debug/claude-yes"
    } else {
        "./target/release/claude-yes"
    };

    // Test that --continue-on-crash flag is accepted
    let output = Command::new(binary_path)
        .args(&["--continue-on-crash", "--help"])
        .output()
        .expect("Failed to execute claude-yes");

    assert!(output.status.success(), "Help should work with --continue-on-crash flag");
}

#[test]
fn test_log_file_flag() {
    let binary_path = if cfg!(debug_assertions) {
        "./target/debug/claude-yes"
    } else {
        "./target/release/claude-yes"
    };

    // Test that --log-file flag is accepted
    let output = Command::new(binary_path)
        .args(&["--log-file", "test.log", "--help"])
        .output()
        .expect("Failed to execute claude-yes");

    assert!(output.status.success(), "Help should work with --log-file flag");
}