# Running Lock Implementation Plan

## Overview

Implement a file-based locking mechanism to prevent multiple claude-yes agents from running concurrently in the same directory (or git repository), and provide queue management for waiting tasks.

## Requirements

1. Before spawning an agent, save task info to `~/.claude-yes/running.lock.json`
2. Lock file structure: `{tasks: [{cwd, task, pid, status}]}`
3. Check lock when launching agent:
   - If cwd exists and running → watch and show "queueing-for-unlock-of-[task]"
   - If in git repo (`.git` exists), check by git root instead of exact cwd
   - Skip this feature if `.git` folder doesn't exist (use exact cwd match)
4. Handle concurrent writes from multiple agents safely

## Lock File Structure

```typescript
interface LockFile {
  tasks: Task[];
}

interface Task {
  cwd: string; // Current working directory or git root
  gitRoot?: string; // Git repository root (if applicable)
  task: string; // Description of the task (from prompt)
  pid: number; // Process ID
  status: "running" | "queued" | "completed" | "failed";
  startedAt: number; // Timestamp when started
  lockedAt: number; // Timestamp when lock acquired
}
```

## Implementation Strategy

### 1. Lock File Location

- Path: `~/.claude-yes/running.lock.json`
- Create directory if doesn't exist

### 2. Concurrency Safety (Critical)

To handle multiple agents writing to the same lock file:

**Option A: Atomic File Operations with Retry**

1. Read current lock file
2. Parse JSON
3. Modify tasks array
4. Write to temporary file
5. Atomic rename/move to actual lock file
6. Use exponential backoff retry on conflicts
7. Include process PID validation to clean stale locks

**Option B: File-based Mutex Lock**

1. Use a separate `.lock` file for synchronization
2. Use `fs.open()` with `wx` flag (exclusive write)
3. Hold lock during read-modify-write operations
4. Release lock after operation
5. Timeout if lock held too long (stale lock cleanup)

**Chosen Approach: Option A** (simpler, more portable)

- Use atomic write pattern with temp file + rename
- Add retry logic with exponential backoff
- Clean stale locks based on PID validation
- Maximum 5 retry attempts with 50ms, 100ms, 200ms, 400ms, 800ms delays

### 3. Git Repository Detection

```typescript
// Check if in git repo
function getGitRoot(cwd: string): string | null {
  try {
    const result = execSync("git rev-parse --show-toplevel", {
      cwd,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    return result.trim();
  } catch {
    return null; // Not in a git repo
  }
}

// Check if .git exists (faster check)
function isGitRepo(cwd: string): boolean {
  return fs.existsSync(path.join(cwd, ".git"));
}
```

### 4. Lock Check Logic

```typescript
async function checkLock(cwd: string, prompt: string): Promise<LockCheckResult> {
  const gitRoot = getGitRoot(cwd);
  const lockKey = gitRoot || cwd;

  const lockFile = await readLockFile();

  // Find running tasks for this location
  const runningTasks = lockFile.tasks.filter((task) => {
    if (!isProcessRunning(task.pid)) return false; // Skip stale locks

    if (gitRoot) {
      // In git repo: check by git root
      return task.gitRoot === gitRoot && task.status === "running";
    } else {
      // Not in git repo: exact cwd match
      return task.cwd === lockKey && task.status === "running";
    }
  });

  return {
    isLocked: runningTasks.length > 0,
    blockingTasks: runningTasks,
    lockKey,
  };
}
```

### 5. Queue and Wait Logic

```typescript
async function waitForUnlock(blockingTasks: Task[], currentTask: Task) {
  console.log(`⏳ Queueing for unlock of: ${blockingTasks[0].task}`);

  // Add current task as 'queued'
  await addTask({ ...currentTask, status: "queued" });

  // Poll every 2 seconds
  while (true) {
    await sleep(2000);

    const lockCheck = await checkLock(currentTask.cwd, currentTask.task);

    if (!lockCheck.isLocked) {
      // Lock released, update status to running
      await updateTaskStatus(currentTask.pid, "running");
      console.log(`✓ Lock released, starting task...`);
      break;
    }

    // Show progress indicator
    process.stdout.write(".");
  }
}
```

### 6. Task Lifecycle Management

```typescript
// 1. Before spawning agent
const task = {
  cwd: process.cwd(),
  gitRoot: getGitRoot(process.cwd()),
  task: prompt || "no prompt provided",
  pid: process.pid,
  status: "running",
  startedAt: Date.now(),
  lockedAt: Date.now(),
};

const lockCheck = await checkLock(task.cwd, task.task);

if (lockCheck.isLocked) {
  await waitForUnlock(lockCheck.blockingTasks, task);
} else {
  await addTask(task);
}

// 2. During agent execution
// ... spawn agent and run ...

// 3. After agent completes/exits
await updateTaskStatus(process.pid, exitCode === 0 ? "completed" : "failed");

// 4. Cleanup after delay (optional)
setTimeout(() => removeTask(process.pid), 60000); // Remove after 1 minute
```

### 7. Stale Lock Cleanup

```typescript
function isProcessRunning(pid: number): boolean {
  try {
    // Sending signal 0 checks if process exists without killing it
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function cleanStaleLocks() {
  const lockFile = await readLockFile();

  lockFile.tasks = lockFile.tasks.filter((task) => {
    if (isProcessRunning(task.pid)) return true;

    console.log(`🧹 Cleaned stale lock for PID ${task.pid}`);
    return false;
  });

  await writeLockFile(lockFile);
}
```

## Module Structure

Create new file: `runningLock.ts`

### Exported Functions:

1. `acquireLock(cwd: string, prompt: string): Promise<void>` - Acquire lock or wait
2. `releaseLock(pid?: number): Promise<void>` - Release lock for current process
3. `updateTaskStatus(pid: number, status: TaskStatus): Promise<void>` - Update task status
4. `cleanStaleLocks(): Promise<void>` - Remove stale locks

## Integration Points

### In `index.ts` (main claudeYes function):

```typescript
// At the beginning of claudeYes()
if (shouldUseLock(cwd)) {
  await acquireLock(cwd, prompt);
}

// Register cleanup on exit
process.on("exit", () => releaseLock());
process.on("SIGINT", () => {
  releaseLock();
  process.exit(130);
});
process.on("SIGTERM", () => {
  releaseLock();
  process.exit(143);
});

// In the final return
try {
  // ... existing code ...
  return { exitCode, logs };
} finally {
  await releaseLock();
}
```

### In `cli.ts`:

No changes needed - lock logic is internal to index.ts

## Edge Cases to Handle

1. **Multiple git repos nested**: Use the closest .git (git rev-parse finds it)
2. **Symbolic links**: Resolve to real path before comparison
3. **Process crash without cleanup**: PID validation handles this
4. **Lock file corruption**: Try-catch with fallback to empty lock file
5. **Race condition on lock file**: Retry logic with exponential backoff
6. **Long-running queue**: Show periodic status updates
7. **User Ctrl+C while queued**: Clean up queued task on SIGINT
8. **No .git folder**: Use exact cwd match instead

## Testing Scenarios

1. Single agent in git repo - should work normally
2. Two agents in same git repo simultaneously - second should queue
3. Two agents in different git repos - both should run
4. Two agents in same non-git directory - second should queue
5. Two agents in different subdirs of same git repo - second should queue
6. Agent crash - stale lock should be cleaned
7. Lock file doesn't exist - should create it
8. Lock file corrupted - should reset and continue
9. Process killed with SIGKILL - next agent should clean stale lock

## Performance Considerations

- Lock file read/write: ~1-5ms (acceptable overhead)
- PID check: ~1ms per task
- Git root detection: ~10-50ms (cached after first call)
- Polling interval: 2 seconds (balance between responsiveness and overhead)
- Maximum retry attempts: 5 (total ~1.5s max wait for lock acquisition)

## Future Enhancements (Not in Scope)

1. Web UI to view all running tasks
2. Network-based distributed locking
3. Task priority queue
4. Maximum queue wait time with timeout
5. Lock inheritance for child processes
6. Database backend instead of JSON file
