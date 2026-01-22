# Database CLI Commands

Agent-yes includes built-in database query commands to inspect projects and runs.

## Quick Reference

```bash
# Projects
agent-yes projects list [limit]    # List recent projects
agent-yes projects show [dir]      # Show project details

# Runs
agent-yes runs list [limit]        # List recent runs
agent-yes runs active               # List running processes
agent-yes runs crashed              # List crashed runs

# Help
agent-yes help db                   # Show database command help
```

## Commands

### Projects

#### `agent-yes projects list [limit]`

List recently used projects in YAML format. Default limit is 10.

**Example:**

```bash
$ agent-yes projects list 5
# Recent 3 Projects
-
  id: 1
  dir: /home/user/my-project
  cmd: claude
  prompt: run all tests and commit changes
  created: "1/21/2026, 11:40:00 AM"
  updated: "1/21/2026, 11:40:00 AM"
  last_run: "1/21/2026, 12:30:00 PM"
-
  id: 2
  dir: /home/user/another-project
  cmd: gemini
  prompt: null
  created: "1/20/2026, 3:15:00 PM"
  updated: "1/20/2026, 3:15:00 PM"
  last_run: "1/20/2026, 4:22:00 PM"
```

**Fields:**

- `id`: Project database ID
- `dir`: Project directory (unique identifier)
- `cmd`: AI CLI command (claude, gemini, etc.)
- `prompt`: Default prompt for the project
- `created`: When project was first registered
- `updated`: Last configuration update
- `last_run`: Most recent run timestamp

---

#### `agent-yes projects show [dir]`

Show detailed information about a specific project, including statistics and recent runs.

**Arguments:**

- `dir`: Project directory (default: current directory)

**Example:**

```bash
$ agent-yes projects show
# Project: /home/user/my-project
project:
  id: 1
  dir: /home/user/my-project
  cmd: claude
  prompt: run all tests and commit changes
  created: "1/21/2026, 11:40:00 AM"
  updated: "1/21/2026, 11:40:00 AM"
  last_run: "1/21/2026, 12:30:00 PM"
statistics:
  total_runs: 15
  completed: 12
  failed: 2
  crashed: 1
  running: 0
recent_runs:
  -
    id: 45
    pid: 12345
    status: completed
    exit_code: 0
    started: "1/21/2026, 12:30:00 PM"
    ended: "1/21/2026, 12:35:00 PM"
    duration: 300s
  -
    id: 44
    pid: 12344
    status: completed
    exit_code: 0
    started: "1/21/2026, 12:00:00 PM"
    ended: "1/21/2026, 12:10:00 PM"
    duration: 600s
```

**Statistics:**

- `total_runs`: Total number of runs for this project
- `completed`: Successfully completed runs
- `failed`: Runs that failed with non-zero exit code
- `crashed`: Runs that crashed unexpectedly
- `running`: Currently active runs

---

### Runs

#### `agent-yes runs list [limit]`

List recent runs across all projects. Default limit is 10.

**Example:**

```bash
$ agent-yes runs list 3
# Recent 3 Runs
-
  id: 45
  pid: 12345
  project_id: 1
  status: completed
  exit_code: 0
  started: "1/21/2026, 12:30:00 PM"
  ended: "1/21/2026, 12:35:00 PM"
  duration: 300s
  args:
    - --exit-on-idle=60s
-
  id: 44
  pid: 12344
  project_id: 1
  status: completed
  exit_code: 0
  started: "1/21/2026, 12:00:00 PM"
  ended: "1/21/2026, 12:10:00 PM"
  duration: 600s
  args: []
```

**Fields:**

- `id`: Run database ID
- `pid`: Process ID
- `project_id`: Associated project ID
- `status`: Run status (running, completed, failed, crashed)
- `exit_code`: Process exit code (null for crashed/running)
- `started`: When the run started
- `ended`: When the run ended (null if running)
- `duration`: How long the run took (in seconds)
- `args`: Additional arguments passed to the run

---

#### `agent-yes runs active`

List all currently running processes.

**Example:**

```bash
$ agent-yes runs active
# Active Runs (2)
-
  id: 46
  pid: 12346
  project_id: 1
  started: "1/21/2026, 12:40:00 PM"
  running_for: 120s
  args:
    - --exit-on-idle=60s

$ agent-yes runs active
# Active Runs (0)
No active runs
```

**Use cases:**

- Check what's currently running
- Find processes to kill
- Monitor active sessions
- Detect stuck processes

---

#### `agent-yes runs crashed`

List all runs that crashed unexpectedly, with project information.

**Example:**

```bash
$ agent-yes runs crashed
# Crashed Runs (2)
-
  run_id: 43
  pid: 12343
  project_id: 1
  dir: /home/user/my-project
  cmd: claude
  started: "1/21/2026, 11:50:00 AM"
  ended: "1/21/2026, 11:52:00 AM"
-
  run_id: 38
  pid: 12340
  project_id: 2
  dir: /home/user/another-project
  cmd: gemini
  started: "1/20/2026, 4:00:00 PM"
  ended: "1/20/2026, 4:01:00 PM"
```

**Use cases:**

- Debug crash patterns
- Identify problematic projects
- Review recent failures
- Crash recovery analysis

---

## Output Format

All commands output YAML format for easy parsing and readability.

### Parse YAML in Scripts

**Using yq:**

```bash
agent-yes projects list | yq '.[0].dir'
# Output: /home/user/my-project
```

**Using Python:**

```bash
agent-yes projects list | python -c 'import yaml, sys; print(yaml.safe_load(sys.stdin)[0]["dir"])'
```

**Using jq (convert to JSON first):**

```bash
agent-yes projects list | yq -o json | jq '.[0].dir'
```

---

## Usage Patterns

### Check Recent Activity

```bash
# See what you've been working on
agent-yes projects list

# Show details of current project
agent-yes projects show

# Check recent runs
agent-yes runs list
```

### Monitor Active Processes

```bash
# Check what's running
agent-yes runs active

# In a monitoring loop
watch -n 5 'agent-yes runs active'
```

### Debug Crashes

```bash
# Find all crashed runs
agent-yes runs crashed

# Show project with crashes
agent-yes projects show | grep -A 20 statistics

# Get crash count per project
agent-yes projects list | grep -E "(dir|crashed)"
```

### Integration with Scripts

**Resume last project:**

```bash
#!/bin/bash
LAST_PROJECT=$(agent-yes projects list 1 | yq '.[0]')
DIR=$(echo "$LAST_PROJECT" | yq '.dir')
CMD=$(echo "$LAST_PROJECT" | yq '.cmd')
PROMPT=$(echo "$LAST_PROJECT" | yq '.prompt')

cd "$DIR"
agent-yes "$CMD" -- "$PROMPT"
```

**Clean up old runs:**

```bash
#!/bin/bash
# Check crashed runs older than 7 days
agent-yes runs crashed | yq '.[] | select(.started < "'$(date -d '7 days ago' +%s)'")'
```

---

## Pass-Through to Normal CLI

Database commands don't interfere with normal agent-yes usage:

```bash
# These are database commands
agent-yes projects list
agent-yes runs active

# These still work normally
agent-yes claude -- solve all TODOs
agent-yes gemini hello world
agent-yes --help
```

The CLI checks for database commands first, and only handles them if the first argument matches `projects`, `runs`, or `help db`. Everything else passes through to the normal CLI.

---

## Database Location

The database is stored at:

```
<project-dir>/.agent-yes/store.sqlite
```

Each project directory has its own database. This keeps project data isolated and makes it easy to:

- Delete project history (just remove `.agent-yes/`)
- Version control settings (add `.agent-yes/` to git if desired)
- Share databases (copy `.agent-yes/` between machines)

The `.agent-yes` directory is git-ignored by default.

---

## Troubleshooting

### No data returned

If commands return empty results:

1. Check you're in the right directory
2. Run `agent-yes` normally first to create project data
3. Verify `.agent-yes/store.sqlite` exists

### Permission errors

If you get permission errors:

```bash
# Check directory permissions
ls -la .agent-yes/

# Fix if needed
chmod 755 .agent-yes/
chmod 644 .agent-yes/store.sqlite
```

### Database corruption

If the database is corrupted:

```bash
# Backup first
cp -r .agent-yes .agent-yes.backup

# Remove and let it recreate
rm -rf .agent-yes/

# Run agent-yes again to recreate
agent-yes claude -- test
```

---

## See Also

- [Database API Documentation](./db.md) - Programmatic database access
- [Database Schema](./db.md#schema) - Table structures and relationships
- [Usage Examples](./db.md#usage-examples) - Code examples for integration
