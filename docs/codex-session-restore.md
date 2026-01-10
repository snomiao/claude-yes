# Codex Session Restoration

This feature enables per-directory session tracking for Codex, allowing you to restore the last session used in each working directory instead of just the globally most recent one.

## How it works

1. **Session Capture**: When running codex, claude-yes automatically captures session IDs from the output and stores them mapped to the current working directory.

2. **Storage**: Session IDs are stored in `~/.config/agent-yes/codex-sessions.json` with the format:

   ```json
   {
     "/path/to/project1": {
       "sessionId": "0199e659-0e5f-7843-8876-5a65c64e77c0",
       "lastUsed": "2025-10-27T12:34:56.789Z"
     },
     "/path/to/project2": {
       "sessionId": "0199e660-0e5f-7843-8876-5a65c64e77c1",
       "lastUsed": "2025-10-27T11:20:30.123Z"
     }
   }
   ```

3. **Restoration**: When using `--continue` flag or when codex crashes and robust recovery is enabled, claude-yes will:
   - Look up the stored session ID for the current directory
   - Use `codex resume [session-id]` instead of `codex resume --last`
   - Fall back to `--last` if no stored session exists

## Usage

### Manual continuation

```bash
# Start codex and work on something
codex-yes "help me with my code"

# Later, continue the same session in the same directory
codex-yes --continue "let's add more features"
```

### Automatic crash recovery

When robust mode is enabled (default), if codex crashes, it will automatically resume the correct session for the current directory:

```bash
# This will automatically use the right session if codex crashes
codex-yes --robust "complex task that might crash"
```

### Different directories, different sessions

```bash
cd /project1
codex-yes "work on project 1"  # Creates session A

cd /project2
codex-yes "work on project 2"  # Creates session B

cd /project1
codex-yes --continue "continue project 1"  # Resumes session A

cd /project2
codex-yes --continue "continue project 2"  # Resumes session B
```

## Benefits

- **Context Preservation**: Each project maintains its own conversation context
- **No Manual Session Management**: No need to remember or copy session IDs
- **Automatic Recovery**: Crash recovery uses the right session for each directory
- **Backwards Compatible**: Falls back to global `--last` when no stored session exists
