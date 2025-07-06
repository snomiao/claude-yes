# Auto Claude

A wrapper tool that automates interactions with the Claude CLI by automatically handling common prompts and responses.

## Features

- Spawns and manages a Claude CLI process
- Automatically responds to common prompts like "Yes, proceed" and "Yes"
- Streams output with prefixed logging for better visibility
- Handles terminal resizing for proper PTY management
- Filters and processes ANSI control characters

## Installation

```bash
bun install
```

## Usage

⚠️ **Important Security Warning**: Only run this on trusted repositories. This tool automatically responds to prompts and can execute commands without user confirmation.

```bash
bun run index.ts
```

The tool will:
1. Clear the terminal
2. Spawn a Claude CLI process
3. Forward your input to Claude
4. Automatically respond to confirmation prompts
5. Display output with "sflow |" prefix

## Scripts

- `build` - Build the project and create UMD bundle
- `test` - Run tests
- `release` - Build, test, and publish a new version

## Dependencies

- `node-pty` - For spawning and managing the Claude CLI process
- `sflow` - For stream processing and data flow management
- `from-node-stream` - For converting Node.js streams to web streams

## License

MIT
