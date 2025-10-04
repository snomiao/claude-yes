pub mod claude_wrapper;
pub mod idle_watcher;
pub mod ready_manager;
pub mod terminal_render;
pub mod utils;

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn test_remove_control_characters() {
        let input = "\x1b[31mRed Text\x1b[0m Normal\x08Backspace";
        let expected = "Red Text NormalBackspace";
        assert_eq!(utils::remove_control_characters(input), expected);
    }

    #[test]
    fn test_terminal_render() {
        let mut render = terminal_render::TerminalRender::new();

        render.write("Hello\n");
        render.write("World");

        let output = render.render();
        assert!(output.contains("Hello"));
        assert!(output.contains("World"));
    }

    #[test]
    fn test_terminal_render_with_control_chars() {
        let mut render = terminal_render::TerminalRender::new();

        render.write("Test\x08\x08st"); // Backspace characters
        render.write("\nLine 2");

        let output = render.render();
        assert!(output.contains("Te"));
        assert!(output.contains("Line 2"));
    }

    #[tokio::test]
    async fn test_ready_manager() {
        let manager = ready_manager::ReadyManager::new();

        // Initially not ready
        assert!(!manager.is_ready().await);

        // Set to ready
        manager.ready();
        tokio::time::sleep(Duration::from_millis(10)).await;
        assert!(manager.is_ready().await);

        // Set to unready
        manager.unready();
        tokio::time::sleep(Duration::from_millis(10)).await;
        assert!(!manager.is_ready().await);
    }

    #[tokio::test]
    async fn test_idle_watcher_timeout() {
        let watcher = idle_watcher::IdleWatcher::new(Duration::from_millis(50));

        // Should not be idle initially
        assert!(!watcher.is_idle().await);

        // Wait for timeout
        tokio::time::sleep(Duration::from_millis(60)).await;
        assert!(watcher.is_idle().await);

        // Ping should reset idle state
        watcher.ping().await;
        assert!(!watcher.is_idle().await);
    }
}