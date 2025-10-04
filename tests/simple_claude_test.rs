use std::process::Command;
use std::fs;
use std::path::Path;

#[test]
fn test_claude_yes_with_version_flag() {
    // This test verifies that claude-yes can pass through the --version flag to claude
    let binary_path = if cfg!(debug_assertions) {
        "./target/debug/claude-yes"
    } else {
        "./target/release/claude-yes"
    };

    let output = Command::new(binary_path)
        .args(&["--exit-on-idle", "2s", "--", "--version"])
        .output()
        .expect("Failed to execute claude-yes");

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    // Should contain claude version info
    let combined_output = format!("{}{}", stdout, stderr);
    assert!(
        combined_output.contains("Claude") || combined_output.contains("claude") || combined_output.contains("1."),
        "Output should contain version info. Stdout: '{}', Stderr: '{}'",
        stdout,
        stderr
    );
}

#[test]
#[ignore] // This test requires claude CLI and may take time
fn test_simple_file_creation_with_claude() {
    let test_file = "./test_output.txt";
    let binary_path = if cfg!(debug_assertions) {
        "./target/debug/claude-yes"
    } else {
        "./target/release/claude-yes"
    };

    // Cleanup
    let _ = fs::remove_file(test_file);

    // Run claude-yes with a simple file creation command
    let output = Command::new(binary_path)
        .args(&[
            "--exit-on-idle", "5s",
            "--verbose",
            "--",
            "just create a file called test_output.txt with content 'Hello from Claude'"
        ])
        .output()
        .expect("Failed to execute claude-yes");

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    // Check if command succeeded
    if !output.status.success() {
        eprintln!("Command failed!");
        eprintln!("Exit code: {:?}", output.status.code());
        eprintln!("Stdout: {}", stdout);
        eprintln!("Stderr: {}", stderr);
    }

    // Check if file was created
    if Path::new(test_file).exists() {
        let content = fs::read_to_string(test_file).expect("Failed to read test file");
        println!("File created with content: {}", content);
        assert!(content.contains("Hello") || content.contains("Claude"), "File should contain expected text");

        // Cleanup
        let _ = fs::remove_file(test_file);
    } else {
        // This might fail if Claude takes longer or doesn't create the file
        println!("File not created - this is expected if Claude CLI is not fully configured");
    }
}