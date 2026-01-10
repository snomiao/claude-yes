# Running Lock Usage Examples

## Overview

The running lock feature prevents multiple claude-yes agents from running concurrently in the same directory or git repository. This ensures that agents don't interfere with each other when working on the same codebase.

## How It Works

### Git Repository Detection

When you start an agent, the system checks if the current directory is inside a git repository:

- **In a Git Repo**: The lock is based on the git repository root. This means if you start two agents anywhere within the same git repo, the second one will queue.
- **Not in a Git Repo**: The lock is based on the exact directory path.

### Lock File Location

Lock information is stored in: `~/.claude-yes/running.lock.json`

## Usage Examples

### Example 1: Same Git Repository

```bash
# Terminal 1: Start agent in project root
cd ~/my-project
claude-yes "implement authentication"
# ✓ Lock acquired, agent starts working

# Terminal 2: Start agent in a subdirectory
cd ~/my-project/src
claude-yes "add tests"
# ⏳ Queueing for unlock of: implement authentication
# ... waits for first agent to complete ...
# ✓ Lock released, starting task...
```

### Example 2: Different Git Repositories

```bash
# Terminal 1
cd ~/project-a
claude-yes "refactor code"
# ✓ Lock acquired for project-a

# Terminal 2
cd ~/project-b
claude-yes "add feature"
# ✓ Lock acquired for project-b
# Both agents run simultaneously (different repos)
```

### Example 3: Non-Git Directories

```bash
# Terminal 1
cd ~/documents
claude-yes "organize files"
# ✓ Lock acquired for ~/documents

# Terminal 2
cd ~/documents
claude-yes "create report"
# ⏳ Queueing for unlock of: organize files

# Terminal 3
cd ~/downloads
claude-yes "cleanup old files"
# ✓ Lock acquired for ~/downloads
# Runs simultaneously (different directory)
```

## Features

### Automatic Stale Lock Cleanup

If an agent crashes or is killed, the lock is automatically cleaned up when the next agent checks the lock file. The system verifies that the process ID is still running.

### Queue Management

When an agent needs to wait:

- It's added to the queue with status 'queued'
- Progress indicators show it's waiting
- Once the blocking agent completes, the queued agent automatically starts

### Process Status Tracking

Each task in the lock file includes:

- `cwd`: Current working directory
- `gitRoot`: Git repository root (if applicable)
- `task`: Description of what the agent is doing
- `pid`: Process ID for validation
- `status`: One of: 'running', 'queued', 'completed', 'failed'
- `startedAt`: When the task started
- `lockedAt`: When the lock was acquired

## Checking Current Locks

You can inspect the current lock state:

```bash
cat ~/.claude-yes/running.lock.json
```

Example output:

```json
{
  "tasks": [
    {
      "cwd": "/home/user/my-project",
      "gitRoot": "/home/user/my-project",
      "task": "implement authentication",
      "pid": 12345,
      "status": "running",
      "startedAt": 1696800000000,
      "lockedAt": 1696800000000
    }
  ]
}
```

## Programmatic Usage

If you're using claude-yes as a library:

```typescript
import claudeYes from "claude-yes";

// The lock is automatically managed
await claudeYes({
  cli: "claude",
  prompt: "help me with this task",
  cwd: process.cwd(),
});
// Lock is automatically released when done
```

### Manual Lock Management

```typescript
import { acquireLock, releaseLock, cleanStaleLocks, shouldUseLock } from "claude-yes/runningLock";

// Check if lock should be used
if (shouldUseLock(process.cwd())) {
  // Acquire lock (will wait if locked)
  await acquireLock(process.cwd(), "My task description");

  try {
    // Do your work here
    console.log("Working...");
  } finally {
    // Always release the lock
    await releaseLock();
  }
}

// Clean up any stale locks
await cleanStaleLocks();
```

## Configuration

The lock feature is enabled by default. It automatically detects whether to use git-based locking or directory-based locking.

### Disabling the Lock

If you need to disable the locking feature (for example, to run multiple agents in the same repository simultaneously), use the `--disable-lock` flag:

```bash
claude-yes --disable-lock "help me with this task"
```

Or when using as a library:

```typescript
import claudeYes from "claude-yes";

await claudeYes({
  cli: "claude",
  prompt: "help me with this task",
  disableLock: true, // Disable the lock
});
```

**Warning**: Disabling the lock can lead to conflicts when multiple agents try to modify the same files simultaneously. Only disable it if you understand the risks and are working on different parts of the codebase.

## Troubleshooting

### Lock Not Releasing

If a lock seems stuck:

1. Check if the process is actually running: `ps aux | grep <pid>`
2. Manually clean stale locks: `echo '{"tasks":[]}' > ~/.claude-yes/running.lock.json`
3. The next agent will automatically clean invalid locks

### Multiple Agents Not Queueing

Verify you're in the same git repository:

```bash
git rev-parse --show-toplevel
```

Both agents should show the same git root.

### Disable Locking (Not Recommended)

If you need to disable locking for testing, you can modify the lock file to always return empty tasks, but this is not recommended for production use.
