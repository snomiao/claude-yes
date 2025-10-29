# CLI Yes Automation Skill

A skill for automating AI CLI tool interactions by handling common prompts and managing continuous operation.

## Description

This skill helps you work with the `cli-yes` wrapper tool, which automates interactions with various AI CLI tools (Claude, Gemini, Codex, Copilot, Cursor, Grok, Qwen) by automatically responding to common prompts and keeping the tools running continuously.

## When to Use This Skill

- Setting up automated AI CLI workflows
- Configuring continuous operation with AI assistants
- Implementing auto-response patterns for yes/no prompts
- Managing crash recovery and idle detection
- Running AI CLI tools in automation scripts or CI/CD pipelines

## Key Capabilities

### Multi-CLI Support
Works with multiple AI coding assistants:
- Claude Code (Anthropic) - Industry-leading performance
- Gemini CLI (Google) - Free tier with generous limits
- Codex CLI (OpenAI/Microsoft) - Cloud-based collaboration
- Copilot CLI (GitHub) - Seamless GitHub integration
- Cursor CLI - Multi-model support with RAG
- Grok CLI (xAI) - Real-time data access
- Qwen Code CLI (Alibaba) - Open source, high performance

### Automation Features
- **Auto-Response**: Automatically responds "Yes" to common prompts
- **Continuous Operation**: Keeps AI running until task completion
- **Crash Recovery**: Automatic process restart on crashes
- **Idle Detection**: Optional auto-exit when AI becomes idle
- **Interactive Control**: Queue prompts or cancel with ESC/Ctrl+C

## Usage Examples

### Basic Command Line Usage

```bash
# Use Claude (default)
claude-yes -- run all tests and commit current changes
bunx claude-yes "Solve TODO.md"

# Use other AI tools
codex-yes -- refactor this function
grok-yes -- help me with this code
copilot-yes -- generate unit tests
cursor-yes -- optimize performance
gemini-yes -- debug this code
qwen-yes -- implement new feature

# Auto-exit when idle (for automation)
claude-yes --exit-on-idle=60s "run all tests and commit current changes"
```

### Library Usage in Node.js

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

## Configuration Options

- `--cli=<tool>`: Specify AI CLI tool (claude, gemini, codex, copilot, cursor, grok, qwen)
- `--exit-on-idle=<duration>`: Auto-exit after specified idle time (e.g., "60s", "5m")
- Custom CLI args can be passed through for tool-specific options

## Security Considerations

⚠️ **Important**: Only run on trusted repositories. This tool:
- Automatically responds to prompts without user confirmation
- Can execute commands automatically
- May be vulnerable to prompt injection attacks in malicious code/files

Always review repositories before running automated tools.

## Implementation Details

Uses `node-pty` or `bun-pty` to manage AI CLI processes with:
- **Pattern matching**: Detects ready states, prompts, and errors
- **Auto-response system**: Sends "Yes" to common prompts
- **Process lifecycle management**: Handles crashes and graceful exits
- **Tool-specific configurations**: Custom patterns for each CLI

## Installation

```bash
# Install the wrapper tool globally
npm install cli-yes -g

# Install your preferred AI CLI
npm install -g @anthropic-ai/claude-code  # Claude
npm install -g @vibe-kit/grok-cli         # Grok
# See documentation for other CLI installation
```

## Best Practices

1. **Start small**: Test with simple tasks before complex automation
2. **Use idle timeout**: Set `--exit-on-idle` for automated scripts
3. **Review output**: Check logs and results regularly
4. **Trust repositories only**: Never run on untrusted code
5. **Choose the right CLI**: Match tool to task requirements
   - Complex tasks → Claude Code
   - Budget-conscious → Gemini or Qwen
   - GitHub integration → Copilot
   - Team collaboration → Codex or Cursor

## Resources

- GitHub: https://github.com/snomiao/claude-yes
- Claude Code: https://www.anthropic.com/claude-code
- Issue Tracker: https://github.com/snomiao/claude-yes/issues

## License

MIT - See project repository for details
