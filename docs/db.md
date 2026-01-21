# Database Module

The database module provides persistent storage for tracking projects and runs in agent-yes. It enables project management, run tracking, crash recovery, and session history.

## Purpose

The database is used to:

- **Track Projects**: Store project configurations with default commands and prompts
- **Monitor Runs**: Track active and completed AI CLI tool runs
- **Crash Recovery**: Detect and recover from crashed sessions
- **History**: Maintain run history for each project
- **Analytics**: Analyze patterns, success rates, and usage

## Runtime Compatibility

The database module automatically detects the runtime environment and uses the appropriate SQLite library:

- **Bun**: Uses native `bun:sqlite` (faster, built-in)
- **Node.js**: Uses `better-sqlite3` (npm package)

The module provides a unified API through [Kysely](https://kysely.dev/) ORM, making the runtime difference transparent to users.

## Database Location

The SQLite database is stored at:
```
<project-dir>/.agent-yes/store.sqlite
```

WAL (Write-Ahead Logging) mode is enabled for better concurrency. The `.agent-yes` directory is git-ignored by default.

## Schema

### `projects` Table

Stores project configurations:

| Column        | Type    | Description                                    |
|---------------|---------|------------------------------------------------|
| `id`          | INTEGER | Auto-incrementing primary key                  |
| `dir`         | TEXT    | Project directory path (unique, required)      |
| `cmd`         | TEXT    | Command to run (e.g., "claude", "gemini")      |
| `prompt`      | TEXT    | Default prompt for this project (nullable)     |
| `created_at`  | INTEGER | Unix timestamp (auto-generated)                |
| `updated_at`  | INTEGER | Unix timestamp (auto-updated)                  |
| `last_run_at` | INTEGER | Unix timestamp of last run (nullable)          |

### `runs` Table

Tracks individual runs:

| Column       | Type    | Description                                     |
|--------------|---------|------------------------------------------------|
| `id`         | INTEGER | Auto-incrementing primary key                   |
| `pid`        | INTEGER | Process ID (required)                           |
| `project_id` | INTEGER | Foreign key to projects.id (cascade delete)     |
| `status`     | TEXT    | "running", "completed", "failed", "crashed"     |
| `exit_code`  | INTEGER | Process exit code (nullable)                    |
| `started_at` | INTEGER | Unix timestamp (auto-generated)                 |
| `ended_at`   | INTEGER | Unix timestamp when run ended (nullable)        |
| `args`       | TEXT    | JSON-encoded array of additional arguments      |

**Indexes:**
- `idx_runs_project_id` on `project_id`
- `idx_runs_status` on `status`
- `idx_runs_pid` on `pid`

## API Reference

### Database Connection

#### `getDb(baseDir?: string): Kysely<DatabaseSchema>`

Get or create the database instance. This function is synchronous and safe to call multiple times (returns cached instance).

```typescript
import { getDb } from './db';

const db = getDb();
// Or specify a custom base directory
const db = getDb('/path/to/project');
```

#### `closeDb(): Promise<void>`

Close the database connection and clean up resources.

```typescript
import { closeDb } from './db';

await closeDb();
```

---

## Projects API

### `upsertProject(params): Promise<InsertResult | UpdateResult>`

Create a new project or update existing one by directory.

**Parameters:**
```typescript
{
  dir: string;         // Project directory (unique identifier)
  cmd: string;         // Command to run (e.g., "claude")
  prompt?: string | null; // Optional default prompt
}
```

**Example:**
```typescript
import { upsertProject } from './db';

const result = await upsertProject({
  dir: '/path/to/project',
  cmd: 'claude',
  prompt: 'run all tests and commit changes'
});
console.log('Project ID:', result.insertId);
```

### `getProjectByDir(dir): Promise<Project | undefined>`

Retrieve a project by its directory path.

**Example:**
```typescript
import { getProjectByDir } from './db';

const project = await getProjectByDir(process.cwd());
if (project) {
  console.log('Found project:', project.cmd);
}
```

### `getProjectById(id): Promise<Project | undefined>`

Retrieve a project by its ID.

**Example:**
```typescript
import { getProjectById } from './db';

const project = await getProjectById(1);
```

### `getAllProjects(): Promise<Project[]>`

Get all projects, ordered by most recently run.

**Example:**
```typescript
import { getAllProjects } from './db';

const projects = await getAllProjects();
for (const project of projects) {
  console.log(`${project.dir} - Last run: ${new Date(project.last_run_at || 0)}`);
}
```

### `updateProjectLastRun(projectId): Promise<UpdateResult>`

Update a project's `last_run_at` timestamp.

**Example:**
```typescript
import { updateProjectLastRun } from './db';

await updateProjectLastRun(1);
```

### `deleteProject(projectId): Promise<DeleteResult>`

Delete a project and all its runs (cascade).

**Example:**
```typescript
import { deleteProject } from './db';

await deleteProject(1);
```

---

## Runs API

### `createRun(params): Promise<InsertResult>`

Create a new run and update project's last_run_at timestamp.

**Parameters:**
```typescript
{
  pid: number;        // Process ID
  project_id: number; // Project ID
  args?: string[];    // Optional additional arguments
}
```

**Example:**
```typescript
import { createRun } from './db';

const run = await createRun({
  pid: process.pid,
  project_id: 1,
  args: ['--exit-on-idle=60s']
});
console.log('Run ID:', run.insertId);
```

### `getRunById(id): Promise<Run | null>`

Get a run by its ID. Automatically parses JSON args.

**Returns:**
```typescript
{
  id: number;
  pid: number;
  project_id: number;
  status: "running" | "completed" | "failed" | "crashed";
  exit_code: number | null;
  started_at: number;
  ended_at: number | null;
  args: string[];  // Automatically parsed from JSON
} | null
```

**Example:**
```typescript
import { getRunById } from './db';

const run = await getRunById(1);
if (run) {
  console.log(`Run ${run.id} status: ${run.status}`);
}
```

### `getRunByPid(pid): Promise<Run | null>`

Get the most recent run by process ID.

**Example:**
```typescript
import { getRunByPid } from './db';

const run = await getRunByPid(12345);
if (run) {
  console.log('Found run:', run.status);
}
```

### `getProjectRuns(projectId): Promise<Run[]>`

Get all runs for a project, ordered by most recent first.

**Example:**
```typescript
import { getProjectRuns } from './db';

const runs = await getProjectRuns(1);
console.log(`Project has ${runs.length} runs`);
```

### `getRunningRuns(): Promise<Run[]>`

Get all currently running runs.

**Example:**
```typescript
import { getRunningRuns } from './db';

const active = await getRunningRuns();
for (const run of active) {
  console.log(`Active run: PID ${run.pid}`);
}
```

### `getAllRuns(): Promise<Run[]>`

Get all runs, ordered by most recent first.

**Example:**
```typescript
import { getAllRuns } from './db';

const allRuns = await getAllRuns();
```

### `updateRunStatus(runId, status, exitCode?): Promise<UpdateResult>`

Update a run's status and optionally its exit code. Automatically sets `ended_at` for non-running states.

**Parameters:**
```typescript
runId: number
status: "running" | "completed" | "failed" | "crashed"
exitCode?: number | null
```

**Example:**
```typescript
import { updateRunStatus } from './db';

// Mark as completed
await updateRunStatus(1, 'completed', 0);

// Mark as failed
await updateRunStatus(2, 'failed', 1);
```

### `markRunAsCrashed(runId): Promise<UpdateResult>`

Convenience function to mark a run as crashed.

**Example:**
```typescript
import { markRunAsCrashed } from './db';

await markRunAsCrashed(1);
```

### `deleteRun(runId): Promise<DeleteResult>`

Delete a specific run.

**Example:**
```typescript
import { deleteRun } from './db';

await deleteRun(1);
```

### `deleteProjectRuns(projectId): Promise<DeleteResult>`

Delete all runs for a project.

**Example:**
```typescript
import { deleteProjectRuns } from './db';

await deleteProjectRuns(1);
```

---

## Combined Queries

### `getProjectWithLatestRun(dir): Promise<ProjectInfo | null>`

Get a project with its latest run and total run count.

**Returns:**
```typescript
{
  project: Project;
  latestRun: Run | null;
  totalRuns: number;
} | null
```

**Example:**
```typescript
import { getProjectWithLatestRun } from './db';

const info = await getProjectWithLatestRun(process.cwd());
if (info) {
  console.log(`Project: ${info.project.cmd}`);
  console.log(`Total runs: ${info.totalRuns}`);
  if (info.latestRun) {
    console.log(`Latest: ${info.latestRun.status}`);
  }
}
```

### `getCrashedRuns(): Promise<CrashedRun[]>`

Get all crashed runs with their project information.

**Returns:**
```typescript
{
  run_id: number;
  pid: number;
  started_at: number;
  ended_at: number | null;
  project_id: number;
  dir: string;
  cmd: string;
}[]
```

**Example:**
```typescript
import { getCrashedRuns } from './db';

const crashed = await getCrashedRuns();
for (const run of crashed) {
  console.log(`Crashed: ${run.cmd} in ${run.dir} (PID: ${run.pid})`);
}
```

---

## Usage Examples

### Complete Workflow

```typescript
import {
  upsertProject,
  createRun,
  updateRunStatus,
  getProjectWithLatestRun,
  closeDb
} from './db';

// 1. Register project
const project = await upsertProject({
  dir: process.cwd(),
  cmd: 'claude',
  prompt: 'Implement new feature'
});

// 2. Start a run
const run = await createRun({
  pid: process.pid,
  project_id: Number(project.insertId),
  args: process.argv.slice(2)
});

// 3. ... do work ...

// 4. Mark as completed
await updateRunStatus(Number(run.insertId), 'completed', 0);

// 5. Check project status
const info = await getProjectWithLatestRun(process.cwd());
console.log(`Total runs: ${info?.totalRuns}`);

// 6. Cleanup
await closeDb();
```

### Crash Recovery

```typescript
import { getRunningRuns, markRunAsCrashed } from './db';

// On startup, check for crashed runs
const running = await getRunningRuns();
for (const run of running) {
  try {
    // Check if process still exists
    process.kill(run.pid, 0);
  } catch (err) {
    // Process is dead, mark as crashed
    await markRunAsCrashed(run.id);
    console.log(`Detected crashed run: ${run.id}`);
  }
}
```

### Project Dashboard

```typescript
import { getAllProjects, getProjectRuns } from './db';

const projects = await getAllProjects();
for (const project of projects) {
  const runs = await getProjectRuns(project.id);

  const completed = runs.filter(r => r.status === 'completed').length;
  const failed = runs.filter(r => r.status === 'failed').length;
  const crashed = runs.filter(r => r.status === 'crashed').length;

  console.log(`\n${project.dir}`);
  console.log(`  Command: ${project.cmd}`);
  console.log(`  Success: ${completed}, Failed: ${failed}, Crashed: ${crashed}`);
  console.log(`  Last run: ${new Date(project.last_run_at || 0).toLocaleString()}`);
}
```

### Resume Last Project

```typescript
import { getAllProjects } from './db';

const projects = await getAllProjects();
const lastProject = projects[0]; // Already sorted by last_run_at

if (lastProject) {
  console.log(`Resuming: ${lastProject.cmd}`);
  if (lastProject.prompt) {
    console.log(`Prompt: ${lastProject.prompt}`);
  }
  // ... start the project ...
}
```

---

## Type Definitions

### ProjectsTable

```typescript
export interface ProjectsTable {
  id: Generated<number>;
  dir: string;
  cmd: string;
  prompt: string | null;
  created_at: Generated<number>;
  updated_at: Generated<number>;
  last_run_at: number | null;
}
```

### RunsTable

```typescript
export interface RunsTable {
  id: Generated<number>;
  pid: number;
  project_id: number;
  status: "running" | "completed" | "failed" | "crashed";
  exit_code: number | null;
  started_at: Generated<number>;
  ended_at: number | null;
  args: string;  // JSON string internally
}
```

### DatabaseSchema

```typescript
export interface DatabaseSchema {
  projects: ProjectsTable;
  runs: RunsTable;
}
```

---

## Advanced Usage

### Direct Kysely Access

For complex queries, use Kysely directly:

```typescript
import { getDb } from './db';

const db = getDb();

// Get success rate by project
const stats = await db
  .selectFrom('runs')
  .innerJoin('projects', 'projects.id', 'runs.project_id')
  .select([
    'projects.dir',
    (eb) => eb.fn.count('runs.id').as('total'),
    (eb) => eb.fn
      .count('runs.id')
      .filterWhere('runs.status', '=', 'completed')
      .as('successful')
  ])
  .groupBy('projects.id')
  .execute();
```

### Migration Example

```typescript
import { getDb } from './db';

const db = getDb();

// Add new column (if not exists)
try {
  await db.schema
    .alterTable('projects')
    .addColumn('description', 'text')
    .execute();
} catch {
  // Column might already exist
}
```

---

## Testing

Run the example to test the database:

```bash
bun examples/db-usage.ts
```

This will:
- Create a project
- Start and complete a run
- Simulate a crash
- Query crashed runs
- List all projects

---

## Performance Considerations

- **WAL Mode**: Enabled for better concurrent read/write performance
- **Indexes**: Optimized for common queries (project_id, status, pid)
- **Foreign Keys**: Cascade deletes for data integrity
- **Single Connection**: Singleton pattern prevents connection overhead
- **Timestamps**: Uses Unix timestamps (integers) for efficient storage and sorting

---

## Best Practices

1. **Always close connections**: Use `closeDb()` in shutdown handlers
2. **Use upsertProject**: Automatically handles create/update logic
3. **Update run status**: Always update status when runs complete/fail
4. **Check for crashes**: On startup, detect orphaned "running" runs
5. **Cleanup old data**: Periodically delete old completed runs if needed

---

## Future Enhancements

Potential additions:

- **Output logs**: Store command output for debugging
- **Environment tracking**: Store environment variables used
- **Resource usage**: Track CPU/memory usage
- **Session recovery**: Resume interrupted sessions with full context
- **Analytics**: More detailed statistics and trends
- **Alerts**: Notify on crashes or failures

---

## Example: Integrate with agent-yes CLI

```typescript
import { upsertProject, createRun, updateRunStatus } from './db';

async function runAgent(cmd: string, prompt: string) {
  // 1. Register project
  const project = await upsertProject({
    dir: process.cwd(),
    cmd,
    prompt
  });

  // 2. Start tracking
  const run = await createRun({
    pid: process.pid,
    project_id: Number(project.insertId),
    args: process.argv.slice(2)
  });

  try {
    // 3. Run the agent
    // ... your agent logic ...

    // 4. Mark as completed
    await updateRunStatus(Number(run.insertId), 'completed', 0);
  } catch (err) {
    // 5. Mark as failed
    await updateRunStatus(Number(run.insertId), 'failed', 1);
    throw err;
  }
}
```

---

## Troubleshooting

### Database locked errors

If you see "database is locked" errors:
- Ensure proper connection cleanup with `closeDb()`
- WAL mode reduces locking but concurrent writes may still conflict
- Consider retry logic with exponential backoff

### Permission errors

The database is in `<project>/.agent-yes/`. Ensure:
- Directory is writable
- No conflicts with other processes
- `.agent-yes` is in `.gitignore`

### Schema changes

When modifying the schema:
1. Consider migration strategy for existing data
2. Test with both Bun and Node runtimes
3. Update type definitions
4. Document breaking changes

---

## Files

- `ts/db.ts` - Main database module
- `examples/db-usage.ts` - Usage example
- `.agent-yes/store.sqlite` - Database file (git-ignored)
- `.agent-yes/store.sqlite-wal` - WAL file
- `.agent-yes/store.sqlite-shm` - Shared memory file
