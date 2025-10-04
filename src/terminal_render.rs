use std::collections::VecDeque;

const MAX_LINES: usize = 10000;
const MAX_LINE_LENGTH: usize = 4096;

pub struct TerminalRender {
    lines: VecDeque<String>,
    current_line: String,
}

impl TerminalRender {
    pub fn new() -> Self {
        Self {
            lines: VecDeque::new(),
            current_line: String::new(),
        }
    }

    pub fn write(&mut self, text: &str) {
        for ch in text.chars() {
            match ch {
                '\n' => {
                    self.push_line();
                    self.current_line.clear();
                }
                '\r' => {
                    // Carriage return - move cursor to beginning of line
                    // In a real terminal emulator, this would move the cursor
                    // For simplicity, we'll clear the current line
                    self.current_line.clear();
                }
                '\x08' | '\x7f' => {
                    // Backspace or DEL
                    self.current_line.pop();
                }
                c if c.is_control() => {
                    // Skip other control characters
                }
                c => {
                    self.current_line.push(c);
                    if self.current_line.len() > MAX_LINE_LENGTH {
                        self.push_line();
                        self.current_line.clear();
                    }
                }
            }
        }
    }

    fn push_line(&mut self) {
        if self.lines.len() >= MAX_LINES {
            self.lines.pop_front();
        }
        self.lines.push_back(self.current_line.clone());
    }

    pub fn render(&self) -> String {
        let mut result = String::new();

        for line in &self.lines {
            result.push_str(line);
            result.push('\n');
        }

        if !self.current_line.is_empty() {
            result.push_str(&self.current_line);
        }

        result
    }

    #[allow(dead_code)]
    pub fn clear(&mut self) {
        self.lines.clear();
        self.current_line.clear();
    }
}