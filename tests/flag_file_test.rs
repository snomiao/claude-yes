use std::fs;
use std::path::Path;
use std::process::Command;

#[test]
#[ignore] // This test requires claude CLI to be installed
fn test_write_file_with_auto_bypass_prompts() {
    let flag_file = "./.cache/flag.json";
    let log_file = "./test-rendered.log";

    // Cleanup function
    let cleanup = || {
        let _ = fs::remove_file(flag_file);
        let _ = fs::remove_file(log_file);
        let _ = fs::remove_dir("./.cache");
    };

    // Initial cleanup
    cleanup();

    // Create cache directory
    let _ = fs::create_dir("./.cache");

    // Start the claude-yes process (use debug build if in test mode)
    let binary_path = if cfg!(debug_assertions) {
        "./target/debug/claude-yes"
    } else {
        "./target/release/claude-yes"
    };

    let output = Command::new(binary_path)
        .args([
            "--log-file",
            log_file,
            "--exit-on-idle",
            "3s",
            "--",
            "just write {\"on\": 1} into ./.cache/flag.json and wait",
        ])
        .output()
        .expect("Failed to start claude-yes");

    // Debug output
    if !output.status.success() {
        eprintln!("Process failed!");
        eprintln!("Exit code: {:?}", output.status.code());
        eprintln!("Stdout: {}", String::from_utf8_lossy(&output.stdout));
        eprintln!("Stderr: {}", String::from_utf8_lossy(&output.stderr));
    }

    assert!(output.status.success(), "Process did not exit successfully");

    // Verify the flag file was created
    assert!(Path::new(flag_file).exists(), "Flag file was not created");

    // Verify the content of the flag file
    let content = fs::read_to_string(flag_file).expect("Failed to read flag file");
    assert!(
        content.contains("\"on\""),
        "Flag file does not contain expected content"
    );
    assert!(
        content.contains("1"),
        "Flag file does not contain expected value"
    );

    // Verify log file was created
    assert!(Path::new(log_file).exists(), "Log file was not created");

    let log_content = fs::read_to_string(log_file).expect("Failed to read log file");
    assert!(!log_content.is_empty(), "Log file is empty");

    // Final cleanup
    cleanup();
}

#[test]
fn test_simple_echo_with_auto_response() {
    // This is a simpler test that doesn't require claude CLI
    let binary_path = if cfg!(debug_assertions) {
        "./target/debug/claude-yes"
    } else {
        "./target/release/claude-yes"
    };

    let output = Command::new(binary_path)
        .arg("--help")
        .output()
        .expect("Failed to execute claude-yes");

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(
        stdout.contains("claude-yes"),
        "Help output doesn't contain program name"
    );
    assert!(
        stdout.contains("--exit-on-idle"),
        "Help output doesn't contain exit-on-idle option"
    );
    assert!(
        stdout.contains("--log-file"),
        "Help output doesn't contain log-file option"
    );
}

#[test]
fn test_version_output() {
    let binary_path = if cfg!(debug_assertions) {
        "./target/debug/claude-yes"
    } else {
        "./target/release/claude-yes"
    };

    let output = Command::new(binary_path)
        .arg("--version")
        .output()
        .expect("Failed to execute claude-yes");

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(
        stdout.contains("claude-yes"),
        "Version output doesn't contain program name"
    );
}

#[test]
fn test_invalid_idle_timeout() {
    let binary_path = if cfg!(debug_assertions) {
        "./target/debug/claude-yes"
    } else {
        "./target/release/claude-yes"
    };

    let output = Command::new(binary_path)
        .args(["--exit-on-idle", "invalid"])
        .output()
        .expect("Failed to execute claude-yes");

    assert!(!output.status.success(), "Should fail with invalid timeout");
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        !stderr.is_empty(),
        "Should have error message for invalid timeout"
    );
}
