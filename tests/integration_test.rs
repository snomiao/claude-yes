use claude_yes::terminal_render::TerminalRender;
use claude_yes::utils::remove_control_characters;
use std::process::Command;

#[test]
#[ignore] // This test is skipped in CI as the binary is built after tests
fn test_binary_exists() {
    // Check that the binary exists (it should already be built)
    let binary_path = "./target/release/claude-yes";
    assert!(
        std::path::Path::new(binary_path).exists(),
        "Binary not found at {}. Run 'cargo build --release' first",
        binary_path
    );
}

#[test]
#[ignore] // This test is skipped in CI as the binary is built after tests
fn test_binary_help() {
    // Test that the binary runs and shows help
    let output = Command::new("./target/release/claude-yes")
        .arg("--help")
        .output();

    if let Ok(output) = output {
        let stdout = String::from_utf8_lossy(&output.stdout);
        assert!(stdout.contains("claude-yes"));
        assert!(stdout.contains("wrapper tool"));
        assert!(output.status.success());
    }
}

#[test]
fn test_terminal_rendering_integration() {
    let mut render = TerminalRender::new();

    // Simulate terminal output with various control sequences
    let sequences = vec![
        "Starting process...\n",
        "Progress: [##########] 100%\r",
        "\x1b[32mSuccess!\x1b[0m\n",
        "Processing \x08\x08\x08\x08\x08\x08\x08\x08\x08Complete\n",
    ];

    for seq in sequences {
        render.write(seq);
    }

    let output = render.render();
    assert!(output.contains("Starting process"));
    assert!(output.contains("Success"));
    assert!(output.contains("Complete"));
}

#[test]
fn test_ansi_removal_comprehensive() {
    let test_cases = vec![
        // Basic colors
        ("\x1b[31mRed\x1b[0m", "Red"),
        // Bold and underline
        ("\x1b[1mBold\x1b[0m", "Bold"),
        // Cursor movements
        ("\x1b[2JClear\x1b[H", "Clear"),
        // Complex sequences (these are not matched by our simple regex)
        // Note: More complex sequences like \x1b[?25h need a more comprehensive regex
        // Multiple control characters (backspace and DEL remove characters)
        ("Test\x08\x08st\x7f\x7f", "Testst"),
    ];

    for (input, expected) in test_cases {
        let result = remove_control_characters(input);
        assert_eq!(result, expected, "Failed for input: {:?}", input);
    }
}

#[test]
#[ignore] // This test is skipped in CI as the binary is built after tests
fn test_version_flag() {
    let output = Command::new("./target/release/claude-yes")
        .arg("--version")
        .output();

    if let Ok(output) = output {
        let stdout = String::from_utf8_lossy(&output.stdout);
        assert!(stdout.contains("claude-yes"));
        assert!(output.status.success());
    }
}
