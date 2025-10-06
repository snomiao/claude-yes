# Yes! Claude

A wrapper tool that automates interactions with various AI CLI tools by automatically handling common prompts and responses. Originally designed for Claude CLI, now supports multiple AI coding assistants.

⚠️ **Important Security Warning**: Only run this on trusted repositories. This tool automatically responds to prompts and can execute commands without user confirmation. Be aware of potential prompt injection attacks where malicious code or instructions could be embedded in files or user inputs to manipulate the automated responses.

## Features

- **Multi-CLI Support**: Works with Claude, Gemini, Codex, Copilot, and Cursor CLI tools
- **Auto-Response**: Automatically responds to common prompts like "Yes, proceed" and "Yes"
- **Continuous Operation**: Keeps the AI assistant running until your task is done, waiting for your next prompt
- **Interactive Control**: You can still queue more prompts or cancel executing tasks with `ESC` or `Ctrl+C`
- **Crash Recovery**: Automatically restarts crashed processes (where supported)
- **Idle Detection**: Optional auto-exit when the AI becomes idle

## Prerequisites

Install the AI CLI tool(s) you want to use:

### Claude
```bash
npm install -g @anthropic-ai/claude-code
```
Learn more: https://www.anthropic.com/claude-code

### Gemini
```bash
# Install Gemini CLI (if available)
# Check Google's documentation for installation instructions
```

### Codex
```bash
# Install Codex CLI (if available)
# Check Microsoft's documentation for installation instructions
```

### GitHub Copilot
```bash
# Install GitHub Copilot CLI
# Check GitHub's documentation for installation instructions
```

### Cursor
### Grok
```bash
npm install -g @vibe-kit/grok-cli
```
Learn more: https://github.com/vibe-kit/grok-cli
```bash
# Install Cursor agent CLI
# Check Cursor's documentation for installation instructions
```

Then install this project:

```bash
npm install claude-yes -g
```

## Usage

### Command Line Interface

```bash
claude-yes [--cli=<tool>] [--exit-on-idle=60s] [tool-command] [prompts]
```

#### Examples

**Claude (default):**
```bash
claude-yes "run all tests and commit current changes"
bunx claude-yes "Solve TODO.md"
```

**Other AI tools:**
```bash
# Use Gemini
claude-yes --cli=gemini "help me debug this code"

# Use Codex  
claude-yes --cli=codex "refactor this function"

# Use Copilot
claude-yes --cli=copilot "generate unit tests"

# Use Cursor
# Use Grok
**Direct Commands:**

```bash
# Use Codex directly
codex-yes "refactor this function"

# Use Grok directly
grok-yes "help me with this code"

# Use Copilot directly
copilot-yes "generate unit tests"

# Use Cursor directly
cursor-yes "optimize performance"

# Use Gemini directly
gemini-yes "debug this code"
```
claude-yes --cli=grok "help me with this code"
claude-yes --cli=cursor "optimize performance"
```

**Auto-exit when idle (useful for automation):**
```bash
claude-yes --exit-on-idle=60s "run all tests and commit current changes"
```

**Alternative with claude-code-execute:**
```bash
claude-code-execute claude-yes "your task here"
```

### Supported CLI Tools

| Tool | CLI Name | Description |
|------|----------|-------------|
| Claude | `claude` | Anthropic's Claude Code (default) |
| Gemini | `gemini` | Google's Gemini CLI |
| Codex | `codex` | Microsoft's Codex CLI |
| Copilot | `copilot` | GitHub Copilot CLI |
| Cursor | `cursor` | Cursor agent CLI |
| Grok | `grok` | Vibe Kit\'s Grok CLI |

The tool will:

1. Run the specified AI CLI tool
2. Automatically respond "Yes" to common yes/no prompts
3. Handle tool-specific patterns and responses
4. When using `--exit-on-idle` flag, automatically exit when the tool becomes idle

<!-- TODO: add usage As lib: call await claudeYes() and it returns render result -->

## Options

- `--cli=<tool>`: Specify which AI CLI tool to use (claude, gemini, codex, copilot, cursor). Defaults to `claude`.
- `--exit-on-idle=<seconds>`: Automatically exit when the AI tool becomes idle for the specified duration. Useful for automation scripts.

## Library Usage

You can also use this as a library in your Node.js projects:

```typescript
import claudeYes from 'claude-yes';

// Use Claude
await claudeYes({
  prompt: 'help me solve all todos in my codebase',
  cli: 'claude',
  cliArgs: ['--verbose'],
  exitOnIdle: 30000, // exit after 30 seconds of idle
  continueOnCrash: true,
  logFile: 'claude.log',
});

// Use other tools
await claudeYes({
  prompt: 'debug this function',
  cli: 'gemini',
  exitOnIdle: 60000,
});
```

## Implementation

The tool uses `node-pty` to spawn and manage AI CLI processes, with a sophisticated pattern-matching system that:

1. **Detects Ready States**: Recognizes when each CLI tool is ready to accept input
2. **Auto-Responds**: Automatically sends "Yes" responses to common prompts
3. **Handles Fatal Errors**: Detects and responds to fatal error conditions
4. **Manages Process Lifecycle**: Handles crashes, restarts, and graceful exits

Each supported CLI has its own configuration defining:
- **Ready patterns**: Regex patterns that indicate the tool is ready for input
- **Enter patterns**: Patterns that trigger automatic "Yes" responses  
- **Fatal patterns**: Patterns that indicate fatal errors requiring exit
- **Binary mapping**: Maps logical names to actual executable names
- **Argument handling**: Special argument processing (e.g., adding `--search` to Codex)

## Dependencies

- `node-pty` or `bun-pty` - For spawning and managing AI CLI processes
- `from-node-stream` - Stream processing utilities
- `sflow` - Functional stream processing
- `terminal-render` - Terminal rendering and text processing
- `phpdie` - Error handling utilities

## Inspiration

This project was inspired by: [Claude Code full auto while I sleep : r/ClaudeAI](https://www.reddit.com/r/ClaudeAI/comments/1klk6aw/claude_code_full_auto_while_i_sleep/)

## License

MIT
