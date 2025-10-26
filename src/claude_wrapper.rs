use anyhow::{Context, Result};
use crossterm::terminal;
use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use std::io::{BufReader, Read, Write};
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{Mutex, RwLock};
use tracing::warn;

use crate::idle_watcher::IdleWatcher;
use crate::ready_manager::ReadyManager;
use crate::terminal_render::TerminalRender;
use crate::utils::remove_control_characters;

pub struct Config {
    pub claude_args: Vec<String>,
    pub continue_on_crash: bool,
    pub exit_on_idle: Option<Duration>,
    pub log_file: Option<String>,
    pub remove_control_characters_from_stdout: bool,
    pub verbose: bool,
}

pub struct ClaudeWrapper {
    config: Config,
    terminal_render: Arc<Mutex<TerminalRender>>,
    ready_manager: Arc<ReadyManager>,
    idle_watcher: Option<Arc<IdleWatcher>>,
    error_no_conversation: Arc<RwLock<bool>>,
}

impl ClaudeWrapper {
    pub fn new(config: Config) -> Result<Self> {
        let terminal_render = Arc::new(Mutex::new(TerminalRender::new()));
        let ready_manager = Arc::new(ReadyManager::new());

        let idle_watcher = config
            .exit_on_idle
            .map(|timeout| Arc::new(IdleWatcher::new(timeout)));

        Ok(Self {
            config,
            terminal_render,
            ready_manager,
            idle_watcher,
            error_no_conversation: Arc::new(RwLock::new(false)),
        })
    }

    pub async fn run(&mut self) -> Result<Option<i32>> {
        let pty_system = NativePtySystem::default();
        let (cols, rows) = terminal::size()?;

        let pty_size = PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        };

        let exit_code = self.run_claude_process(&pty_system, pty_size).await?;

        // Save logs if requested
        if let Some(ref log_file) = self.config.log_file {
            self.save_logs(log_file).await?;
        }

        Ok(exit_code)
    }

    async fn run_claude_process(
        &mut self,
        pty_system: &NativePtySystem,
        pty_size: PtySize,
    ) -> Result<Option<i32>> {
        let exit_code: Option<i32>;
        let continue_on_crash = self.config.continue_on_crash;

        loop {
            let mut cmd = CommandBuilder::new("claude");
            for arg in &self.config.claude_args {
                cmd.arg(arg);
            }

            let pair = pty_system.openpty(pty_size).context("Failed to open PTY")?;

            let child = pair
                .slave
                .spawn_command(cmd)
                .context("Failed to spawn claude")?;

            let reader = pair.master.try_clone_reader()?;
            let mut writer = pair.master.take_writer()?;

            // Start idle watcher if configured
            if let Some(ref idle_watcher) = self.idle_watcher {
                let idle_watcher_clone = Arc::clone(idle_watcher);
                let terminal_render = Arc::clone(&self.terminal_render);
                let ready_manager = Arc::clone(&self.ready_manager);

                tokio::spawn(async move {
                    idle_watcher_clone
                        .watch(move || {
                            let terminal_render = Arc::clone(&terminal_render);
                            let _ready_manager = Arc::clone(&ready_manager);
                            Box::pin(async move {
                                let render = terminal_render.lock().await;
                                let text = render.render();

                                if text.contains("esc to interrupt")
                                    || text.contains("to run in background")
                                {
                                    // info!("[claude-yes] Claude is idle, but seems still working, not exiting yet");
                                    false
                                } else {
                                    // info!("[claude-yes] Claude is idle, exiting...");
                                    true
                                }
                            })
                        })
                        .await;
                });
            }

            // Create channel for auto-responses with larger buffer
            let (response_tx, response_rx) = tokio::sync::mpsc::channel::<String>(100);

            // Process output and input concurrently
            let output_future = self.process_output_with_responses(reader, response_tx);
            let input_future = self.process_input_with_responses(&mut writer, response_rx);

            // Use select! to exit when output task completes (Claude exits)
            tokio::select! {
                output_result = output_future => {
                    // Claude exited, return the result
                    output_result?;
                }
                input_result = input_future => {
                    // Input task shouldn't complete first normally
                    input_result?;
                }
            }

            // Wait for child process exit
            let mut child = child;
            let wait_result = child.wait()?;

            if wait_result.success() {
                exit_code = Some(0);
                break;
            } else {
                let code = wait_result.exit_code() as i32;

                if continue_on_crash {
                    let error_no_conv = *self.error_no_conversation.read().await;
                    if error_no_conv {
                        // info!("Claude crashed with \"No conversation found to continue\", exiting...");
                        exit_code = Some(code);
                        break;
                    }

                    // info!("Claude crashed, restarting...");
                    // Update command to continue
                    self.config.claude_args =
                        vec!["--continue".to_string(), "continue".to_string()];
                } else {
                    exit_code = Some(code);
                    break;
                }
            }
        }

        Ok(exit_code)
    }

    async fn process_output_with_responses(
        &self,
        reader: Box<dyn std::io::Read + Send>,
        response_tx: tokio::sync::mpsc::Sender<String>,
    ) -> Result<()> {
        let mut reader = BufReader::new(reader);
        let terminal_render = Arc::clone(&self.terminal_render);
        let ready_manager = Arc::clone(&self.ready_manager);
        let error_no_conversation = Arc::clone(&self.error_no_conversation);
        let idle_watcher = self.idle_watcher.clone();
        let remove_control_chars = self.config.remove_control_characters_from_stdout;

        tokio::task::spawn_blocking(move || {
            let mut incomplete_utf8 = Vec::new();
            let mut output_buffer = String::new();
            let mut read_buffer = [0u8; 8192]; // Read in chunks, not byte-by-byte
            let rt = tokio::runtime::Handle::current();

            loop {
                match reader.read(&mut read_buffer) {
                    Ok(0) => break, // EOF
                    Ok(n) => {
                        // Combine with any incomplete UTF-8 from previous iteration
                        incomplete_utf8.extend_from_slice(&read_buffer[..n]);

                        // Process as much valid UTF-8 as possible
                        match String::from_utf8(incomplete_utf8.clone()) {
                            Ok(text) => {
                                // All bytes formed valid UTF-8
                                incomplete_utf8.clear();
                                output_buffer.push_str(&text);

                                // Process the chunk
                                rt.block_on(async {
                                    terminal_render.lock().await.write(&text);
                                    ready_manager.ready();

                                    if let Some(ref watcher) = idle_watcher {
                                        watcher.ping().await;
                                    }
                                });

                                // Check for prompts only when we have a newline or sufficient data
                                if text.contains('\n') || output_buffer.len() > 100 {
                                    let clean_text = remove_control_characters(&output_buffer);
                                    let lower = clean_text.to_lowercase();

                                    // Check various prompt patterns
                                    if clean_text.contains("❯ 1. Yes")
                                        || clean_text.contains("❯ 1. Dark mode✔")
                                        || clean_text.contains("Press Enter to continue…")
                                        || lower.contains("trust this project")
                                        || lower.contains("trust the files in this folder")
                                        || lower.contains("allow claude")
                                        || lower.contains("do you want to")
                                        || lower.contains("would you like")
                                        || (lower.contains("yes")
                                            && lower.contains("no")
                                            && clean_text.contains("❯"))
                                        || clean_text.contains("[y/n]")
                                        || clean_text.contains("(y/n)")
                                    {
                                        // info!("[claude-yes] Auto-responding to prompt");
                                        let response =
                                            if lower.contains("[y/n]") || lower.contains("(y/n)") {
                                                "y\n".to_string()
                                            } else {
                                                "\r".to_string()
                                            };
                                        match response_tx.try_send(response) {
                                            Ok(_) => {
                                                // info!("[claude-yes] Auto-response sent");
                                                output_buffer.clear();
                                            }
                                            Err(
                                                tokio::sync::mpsc::error::TrySendError::Closed(_),
                                            ) => {
                                                // Channel closed, likely because input task was cancelled
                                                // This is expected when Claude is exiting, don't warn
                                            }
                                            Err(e) => warn!(
                                                "[claude-yes] Failed to send auto-response: {}",
                                                e
                                            ),
                                        }
                                    }

                                    if clean_text.contains("No conversation found to continue") {
                                        rt.block_on(async {
                                            *error_no_conversation.write().await = true;
                                        });
                                    }
                                }

                                // Output to stdout
                                let output = if remove_control_chars {
                                    remove_control_characters(&text)
                                } else {
                                    text
                                };
                                print!("{}", output);
                                std::io::stdout().flush().ok();

                                // Keep buffer size reasonable
                                if output_buffer.len() > 10000 {
                                    output_buffer = output_buffer.chars().skip(5000).collect();
                                }
                            }
                            Err(e) => {
                                // Handle incomplete UTF-8 sequence
                                let valid_up_to = e.utf8_error().valid_up_to();
                                if valid_up_to > 0 {
                                    // Process the valid part
                                    let text =
                                        String::from_utf8_lossy(&incomplete_utf8[..valid_up_to])
                                            .into_owned();
                                    output_buffer.push_str(&text);

                                    rt.block_on(async {
                                        terminal_render.lock().await.write(&text);
                                        ready_manager.ready();
                                        if let Some(ref watcher) = idle_watcher {
                                            watcher.ping().await;
                                        }
                                    });

                                    let output = if remove_control_chars {
                                        remove_control_characters(&text)
                                    } else {
                                        text
                                    };
                                    print!("{}", output);
                                    std::io::stdout().flush().ok();

                                    // Keep only the incomplete sequence
                                    incomplete_utf8 = incomplete_utf8[valid_up_to..].to_vec();
                                }
                                // If valid_up_to is 0, keep all bytes for next iteration
                            }
                        }
                    }
                    Err(e) => {
                        warn!("Error reading from PTY: {}", e);
                        break;
                    }
                }
            }
        });

        Ok(())
    }

    async fn process_input_with_responses(
        &self,
        writer: &mut Box<dyn std::io::Write + Send>,
        mut response_rx: tokio::sync::mpsc::Receiver<String>,
    ) -> Result<()> {
        // Use crossterm events for raw mode input
        let (stdin_tx, mut stdin_rx) = tokio::sync::mpsc::channel::<Vec<u8>>(10);

        // Spawn thread to read crossterm events in raw mode
        std::thread::spawn(move || {
            use crossterm::event::{self, Event, KeyCode, KeyEvent, KeyModifiers};
            loop {
                if let Ok(Event::Key(key_event)) = event::read() {
                    let mut bytes = Vec::new();
                    match key_event {
                        KeyEvent {
                            code: KeyCode::Char('c'),
                            modifiers,
                            ..
                        } if modifiers.contains(KeyModifiers::CONTROL) => {
                            // Ctrl+C - send interrupt signal
                            bytes.push(3);
                        }
                        KeyEvent {
                            code: KeyCode::Char('d'),
                            modifiers,
                            ..
                        } if modifiers.contains(KeyModifiers::CONTROL) => {
                            // Ctrl+D - EOF
                            break;
                        }
                        KeyEvent {
                            code: KeyCode::Char(c),
                            ..
                        } => {
                            // Regular character
                            let mut buf = [0; 4];
                            let s = c.encode_utf8(&mut buf);
                            bytes.extend_from_slice(s.as_bytes());
                        }
                        KeyEvent {
                            code: KeyCode::Enter,
                            ..
                        } => {
                            bytes.push(b'\r');
                        }
                        KeyEvent {
                            code: KeyCode::Tab, ..
                        } => {
                            bytes.push(b'\t');
                        }
                        KeyEvent {
                            code: KeyCode::Backspace,
                            ..
                        } => {
                            bytes.push(127); // DEL character
                        }
                        KeyEvent {
                            code: KeyCode::Left,
                            ..
                        } => {
                            bytes.extend_from_slice(b"\x1b[D");
                        }
                        KeyEvent {
                            code: KeyCode::Right,
                            ..
                        } => {
                            bytes.extend_from_slice(b"\x1b[C");
                        }
                        KeyEvent {
                            code: KeyCode::Up, ..
                        } => {
                            bytes.extend_from_slice(b"\x1b[A");
                        }
                        KeyEvent {
                            code: KeyCode::Down,
                            ..
                        } => {
                            bytes.extend_from_slice(b"\x1b[B");
                        }
                        KeyEvent {
                            code: KeyCode::Esc, ..
                        } => {
                            bytes.push(27); // ESC
                        }
                        _ => continue, // Ignore other keys
                    }
                    if !bytes.is_empty() && stdin_tx.blocking_send(bytes).is_err() {
                        break;
                    }
                }
            }
        });

        let ready_manager = Arc::clone(&self.ready_manager);

        loop {
            tokio::select! {
                // Handle auto-responses
                Some(response) = response_rx.recv() => {
                    // Wait a bit before sending response
                    tokio::time::sleep(std::time::Duration::from_millis(200)).await;
                    ready_manager.wait().await;
                    writer.write_all(response.as_bytes())?;
                    writer.flush()?;
                }
                // Handle stdin input
                Some(data) = stdin_rx.recv() => {
                    // Wait for shell to be ready before sending input
                    ready_manager.wait().await;
                    writer.write_all(&data)?;
                    writer.flush()?;
                }
                // Exit if both channels are closed
                else => {
                    // Both channels closed, exit
                    break;
                }
            }
        }

        Ok(())
    }

    async fn save_logs(&self, log_file: &str) -> Result<()> {
        let path = Path::new(log_file);
        if let Some(parent) = path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }

        let render = self.terminal_render.lock().await;
        let content = render.render();
        tokio::fs::write(path, content).await?;

        if self.config.verbose {
            // info!("[claude-yes] Written rendered logs to {}", log_file);
        }

        Ok(())
    }
}
