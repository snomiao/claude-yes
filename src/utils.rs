use regex::Regex;
use std::sync::OnceLock;

static ANSI_REGEX: OnceLock<Regex> = OnceLock::new();

pub fn remove_control_characters(text: &str) -> String {
    let regex = ANSI_REGEX.get_or_init(|| {
        // Match ANSI escape sequences and control characters
        // \x1B\[[0-9;]*[a-zA-Z] - ANSI escape sequences
        // [\x00-\x1F\x7F] - Control characters (including \x08 backspace)
        Regex::new(r"\x1B\[[0-9;]*[a-zA-Z]|[\x00-\x1F\x7F]").expect("Failed to compile ANSI regex")
    });

    regex.replace_all(text, "").into_owned()
}

#[allow(dead_code)]
pub async fn sleep_ms(millis: u64) {
    tokio::time::sleep(std::time::Duration::from_millis(millis)).await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_remove_control_characters() {
        let input = "\x1b[31mRed Text\x1b[0m Normal\x08Backspace";
        let expected = "Red Text NormalBackspace";
        assert_eq!(remove_control_characters(input), expected);
    }

    #[test]
    fn test_remove_control_characters_preserves_normal_text() {
        let input = "Normal text without control characters";
        assert_eq!(remove_control_characters(input), input);
    }
}
