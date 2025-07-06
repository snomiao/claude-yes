# Yes! Claude

A wrapper tool that automates interactions with the Claude CLI by automatically handling common prompts and responses.

⚠️ **Important Security Warning**: Only run this on trusted repositories. This tool automatically responds to prompts and can execute commands without user confirmation.

## Features

- Same as `claude` command
- Automatically responds to common prompts like "Yes, proceed" and "Yes"

## Installation

First, install Claude Code globally:

```bash
npm install -g @anthropic-ai/claude-code
```

Then install this project:

```bash
npm install auto-claude -g
```

## Usage


```bash
auto-claude
# works exactly same as `claude` command, and automatically says "Yes" to all yes/no prompts

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

## License

MIT
