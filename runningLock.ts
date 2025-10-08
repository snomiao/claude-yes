import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { mkdir, readFile, rename, unlink, writeFile } from 'fs/promises';
import { homedir } from 'os';
import path from 'path';

export interface Task {
  cwd: string;
  gitRoot?: string;
  task: string;
  pid: number;
  status: 'running' | 'queued' | 'completed' | 'failed';
  startedAt: number;
  lockedAt: number;
}

export interface LockFile {
  tasks: Task[];
}

interface LockCheckResult {
  isLocked: boolean;
  blockingTasks: Task[];
  lockKey: string;
}

const LOCK_DIR = path.join(homedir(), '.claude-yes');
const LOCK_FILE = path.join(LOCK_DIR, 'running.lock.json');
const MAX_RETRIES = 5;
const RETRY_DELAYS = [50, 100, 200, 400, 800]; // exponential backoff in ms
const POLL_INTERVAL = 2000; // 2 seconds

/**
 * Check if a process is running
 */
function isProcessRunning(pid: number): boolean {
  try {
    // Sending signal 0 checks if process exists without killing it
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get git repository root for a directory
 */
function getGitRoot(cwd: string): string | null {
  try {
    const result = execSync('git rev-parse --show-toplevel', {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    return result.trim();
  } catch {
    return null;
  }
}

/**
 * Check if directory is in a git repository
 */
function isGitRepo(cwd: string): boolean {
  try {
    const gitRoot = getGitRoot(cwd);
    return gitRoot !== null;
  } catch {
    return false;
  }
}

/**
 * Resolve path to real path (handling symlinks)
 */
function resolveRealPath(p: string): string {
  try {
    return path.resolve(p);
  } catch {
    return p;
  }
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Read lock file with retry logic and stale lock cleanup
 */
async function readLockFile(): Promise<LockFile> {
  try {
    await mkdir(LOCK_DIR, { recursive: true });

    if (!existsSync(LOCK_FILE)) {
      return { tasks: [] };
    }

    const content = await readFile(LOCK_FILE, 'utf8');
    const lockFile = JSON.parse(content) as LockFile;

    // Clean stale locks while reading
    lockFile.tasks = lockFile.tasks.filter((task) => {
      if (isProcessRunning(task.pid)) return true;
      return false;
    });

    return lockFile;
  } catch (error) {
    // If file is corrupted or doesn't exist, return empty lock file
    return { tasks: [] };
  }
}

/**
 * Write lock file atomically with retry logic
 */
async function writeLockFile(
  lockFile: LockFile,
  retryCount = 0,
): Promise<void> {
  try {
    await mkdir(LOCK_DIR, { recursive: true });

    const tempFile = `${LOCK_FILE}.tmp.${process.pid}`;
    await writeFile(tempFile, JSON.stringify(lockFile, null, 2), 'utf8');

    // Atomic rename
    await rename(tempFile, LOCK_FILE);
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      // Exponential backoff retry
      await sleep(RETRY_DELAYS[retryCount] || 800);
      return writeLockFile(lockFile, retryCount + 1);
    }
    throw error;
  }
}

/**
 * Check if lock exists for the current working directory
 */
async function checkLock(
  cwd: string,
  prompt: string,
): Promise<LockCheckResult> {
  const resolvedCwd = resolveRealPath(cwd);
  const gitRoot = isGitRepo(resolvedCwd) ? getGitRoot(resolvedCwd) : null;
  const lockKey = gitRoot || resolvedCwd;

  const lockFile = await readLockFile();

  // Find running tasks for this location
  const blockingTasks = lockFile.tasks.filter((task) => {
    if (!isProcessRunning(task.pid)) return false; // Skip stale locks
    if (task.status !== 'running') return false; // Only check running tasks

    if (gitRoot && task.gitRoot) {
      // In git repo: check by git root
      return task.gitRoot === gitRoot;
    } else {
      // Not in git repo: exact cwd match
      return task.cwd === lockKey;
    }
  });

  return {
    isLocked: blockingTasks.length > 0,
    blockingTasks,
    lockKey,
  };
}

/**
 * Add a task to the lock file
 */
async function addTask(task: Task): Promise<void> {
  const lockFile = await readLockFile();

  // Remove any existing task with same PID (shouldn't happen, but be safe)
  lockFile.tasks = lockFile.tasks.filter((t) => t.pid !== task.pid);

  lockFile.tasks.push(task);
  await writeLockFile(lockFile);
}

/**
 * Update task status
 */
async function updateTaskStatus(
  pid: number,
  status: Task['status'],
): Promise<void> {
  const lockFile = await readLockFile();
  const task = lockFile.tasks.find((t) => t.pid === pid);

  if (task) {
    task.status = status;
    await writeLockFile(lockFile);
  }
}

/**
 * Remove a task from the lock file
 */
async function removeTask(pid: number): Promise<void> {
  const lockFile = await readLockFile();
  lockFile.tasks = lockFile.tasks.filter((t) => t.pid !== pid);
  await writeLockFile(lockFile);
}

/**
 * Wait for lock to be released
 */
async function waitForUnlock(
  blockingTasks: Task[],
  currentTask: Task,
): Promise<void> {
  const blockingTask = blockingTasks[0];
  console.log(`⏳ Queueing for unlock of: ${blockingTask.task}`);

  // Add current task as 'queued'
  await addTask({ ...currentTask, status: 'queued' });

  let dots = 0;
  while (true) {
    await sleep(POLL_INTERVAL);

    const lockCheck = await checkLock(currentTask.cwd, currentTask.task);

    if (!lockCheck.isLocked) {
      // Lock released, update status to running
      await updateTaskStatus(currentTask.pid, 'running');
      console.log(`\n✓ Lock released, starting task...`);
      break;
    }

    // Show progress indicator
    dots = (dots + 1) % 4;
    process.stdout.write(
      `\r⏳ Queueing${'.'.repeat(dots)}${' '.repeat(3 - dots)}`,
    );
  }
}

/**
 * Clean stale locks from the lock file
 */
export async function cleanStaleLocks(): Promise<void> {
  const lockFile = await readLockFile();

  const before = lockFile.tasks.length;
  lockFile.tasks = lockFile.tasks.filter((task) => {
    if (isProcessRunning(task.pid)) return true;

    console.log(`🧹 Cleaned stale lock for PID ${task.pid}`);
    return false;
  });

  if (lockFile.tasks.length !== before) {
    await writeLockFile(lockFile);
  }
}

/**
 * Acquire lock or wait if locked
 */
export async function acquireLock(
  cwd: string,
  prompt: string = 'no prompt provided',
): Promise<void> {
  const resolvedCwd = resolveRealPath(cwd);
  const gitRoot = isGitRepo(resolvedCwd) ? getGitRoot(resolvedCwd) : null;

  const task: Task = {
    cwd: resolvedCwd,
    gitRoot: gitRoot || undefined,
    task: prompt.substring(0, 100), // Limit task description length
    pid: process.pid,
    status: 'running',
    startedAt: Date.now(),
    lockedAt: Date.now(),
  };

  const lockCheck = await checkLock(resolvedCwd, prompt);

  if (lockCheck.isLocked) {
    await waitForUnlock(lockCheck.blockingTasks, task);
  } else {
    await addTask(task);
  }
}

/**
 * Release lock for current process
 */
export async function releaseLock(pid: number = process.pid): Promise<void> {
  await removeTask(pid);
}

/**
 * Update status of current task
 */
export async function updateCurrentTaskStatus(
  status: Task['status'],
  pid: number = process.pid,
): Promise<void> {
  await updateTaskStatus(pid, status);
}

/**
 * Check if we should use locking for this directory
 * Only use locking if we're in a git repository
 */
export function shouldUseLock(cwd: string): boolean {
  const resolvedCwd = resolveRealPath(cwd);
  // Only use lock if in git repo OR if explicitly requested
  // For now, use lock for all cases to handle same-dir conflicts
  return true;
}
