# Yes! Claude

A wrapper tool that automates interactions with the Claude CLI by automatically handling common prompts and responses.

⚠️ **Important Security Warning**: Only run this on trusted repositories. This tool automatically responds to prompts and can execute commands without user confirmation. Be aware of potential prompt injection attacks where malicious code or instructions could be embedded in files or user inputs to manipulate the automated responses.

## Features

- Same as `claude` command
- Automatically responds to common prompts like "Yes, proceed" and "Yes"
- So, this will Let claude run until your task done, and wait for your next prompt.

## Installation

First, install Claude Code globally:

```bash
npm install -g @anthropic-ai/claude-code
```

Learn more about Claude Code: https://www.anthropic.com/claude-code

Then install this project:

```bash
npm install auto-claude -g
```

## Usage


```bash
auto-claude [command] [prompts]
# works exactly same as `claude` command, and automatically says "Yes" to all yes/no prompts

# e.g.
auto-claude "run all tests and commit current changes"

```

The tool will:
1. run Claude Code
2. Whenever claude stucked on yes/no prompts, Automatically say YES, YES, YES, YES, YES to claude

## Scripts

- `build` - Build the project and create UMD bundle
- `test` - Run tests
- `release` - Build, test, and publish a new version

## Implementation

The tool simply mirrors the terminal use node-pty and looks for "❯ 1. Yes" patterns to automatically respond with "\r" to proceed with Claude's prompts.

```
❯ 1. Yes
  2. No
```

The tool will automatically send "\r" when it detects this pattern.

## Dependencies

- `node-pty` - For spawning and managing the Claude CLI process
- `sflow` - For stream processing and data flow management
- `from-node-stream` - For converting Node.js streams to web streams

## Inspiration

This project was inspired by: [Claude Code full auto while I sleep : r/ClaudeAI](https://www.reddit.com/r/ClaudeAI/comments/1klk6aw/claude_code_full_auto_while_i_sleep/)

## License

MIT
