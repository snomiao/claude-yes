/**
 * Database CLI commands for querying projects and runs
 */

import {
  closeDb,
  getAllProjects,
  getAllRuns,
  getCrashedRuns,
  getProjectByDir,
  getProjectRuns,
  getRunningRuns,
} from "./db";

/**
 * Convert data to YAML format
 */
function toYAML(data: unknown, indent = 0): string {
  const spaces = "  ".repeat(indent);

  if (data === null || data === undefined) {
    return "null";
  }

  if (typeof data === "string") {
    // Escape special characters and wrap in quotes if needed
    if (data.includes("\n") || data.includes(":") || data.includes("#")) {
      return `"${data.replace(/"/g, '\\"')}"`;
    }
    return data;
  }

  if (typeof data === "number" || typeof data === "boolean") {
    return String(data);
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return "[]";
    return data.map((item) => `\n${spaces}- ${toYAML(item, indent + 1)}`).join("");
  }

  if (typeof data === "object") {
    const entries = Object.entries(data);
    if (entries.length === 0) return "{}";
    return entries
      .map(([key, value]) => {
        const yamlValue = toYAML(value, indent + 1);
        if (typeof value === "object" && value !== null && !Array.isArray(value)) {
          return `\n${spaces}${key}:${yamlValue}`;
        }
        return `\n${spaces}${key}: ${yamlValue}`;
      })
      .join("");
  }

  return String(data);
}

/**
 * Format timestamp to readable date
 */
function formatDate(timestamp: number | null): string {
  if (!timestamp) return "never";
  return new Date(timestamp).toLocaleString();
}

/**
 * Handle database CLI commands
 * Returns true if command was handled, false if should pass through to normal CLI
 */
export async function handleDbCommand(argv: string[]): Promise<boolean> {
  // Check if this is a database command
  // Format: agent-yes <command> <subcommand> [args]
  const args = argv.slice(2); // Remove 'node' and script name

  if (args.length === 0) return false;

  const command = args[0];
  const subcommand = args[1];

  try {
    switch (command) {
      case "projects": {
        switch (subcommand) {
          case "list": {
            const limit = Number.parseInt(args[2] || "10", 10) || 10;
            const projects = await getAllProjects();
            const limited = projects.slice(0, limit);

            const output = limited.map((project) => ({
              id: project.id,
              dir: project.dir,
              cmd: project.cmd,
              prompt: project.prompt || null,
              created: formatDate(project.created_at),
              updated: formatDate(project.updated_at),
              last_run: formatDate(project.last_run_at),
            }));

            console.log(`# Recent ${limited.length} Projects`);
            console.log(toYAML(output).trim());
            return true;
          }

          case "show": {
            const dir = args[2] || process.cwd();
            const project = await getProjectByDir(dir);

            if (!project) {
              console.error(`No project found at: ${dir}`);
              process.exit(1);
            }

            const runs = await getProjectRuns(project.id);
            const output = {
              project: {
                id: project.id,
                dir: project.dir,
                cmd: project.cmd,
                prompt: project.prompt || null,
                created: formatDate(project.created_at),
                updated: formatDate(project.updated_at),
                last_run: formatDate(project.last_run_at),
              },
              statistics: {
                total_runs: runs.length,
                completed: runs.filter((r) => r.status === "completed").length,
                failed: runs.filter((r) => r.status === "failed").length,
                crashed: runs.filter((r) => r.status === "crashed").length,
                running: runs.filter((r) => r.status === "running").length,
              },
              recent_runs: runs.slice(0, 5).map((run) => ({
                id: run.id,
                pid: run.pid,
                status: run.status,
                exit_code: run.exit_code,
                started: formatDate(run.started_at),
                ended: formatDate(run.ended_at),
                duration: run.ended_at
                  ? `${Math.round((run.ended_at - run.started_at) / 1000)}s`
                  : "running",
              })),
            };

            console.log(`# Project: ${project.dir}`);
            console.log(toYAML(output).trim());
            return true;
          }

          default:
            console.error(
              `Unknown subcommand: ${subcommand}\n\nAvailable commands:\n  agent-yes projects list [limit]\n  agent-yes projects show [dir]`,
            );
            return false;
        }
      }

      case "runs": {
        switch (subcommand) {
          case "list": {
            const limit = Number.parseInt(args[2] || "10", 10) || 10;
            const runs = await getAllRuns();
            const limited = runs.slice(0, limit);

            const output = limited.map((run) => ({
              id: run.id,
              pid: run.pid,
              project_id: run.project_id,
              status: run.status,
              exit_code: run.exit_code,
              started: formatDate(run.started_at),
              ended: formatDate(run.ended_at),
              duration: run.ended_at
                ? `${Math.round((run.ended_at - run.started_at) / 1000)}s`
                : "running",
              args: run.args,
            }));

            console.log(`# Recent ${limited.length} Runs`);
            console.log(toYAML(output).trim());
            return true;
          }

          case "active": {
            const runs = await getRunningRuns();

            const output = runs.map((run) => ({
              id: run.id,
              pid: run.pid,
              project_id: run.project_id,
              started: formatDate(run.started_at),
              running_for: `${Math.round((Date.now() - run.started_at) / 1000)}s`,
              args: run.args,
            }));

            console.log(`# Active Runs (${runs.length})`);
            if (runs.length > 0) {
              console.log(toYAML(output).trim());
            } else {
              console.log("No active runs");
            }
            return true;
          }

          case "crashed": {
            const crashed = await getCrashedRuns();

            const output = crashed.map((run) => ({
              run_id: run.run_id,
              pid: run.pid,
              project_id: run.project_id,
              dir: run.dir,
              cmd: run.cmd,
              started: formatDate(run.started_at),
              ended: formatDate(run.ended_at),
            }));

            console.log(`# Crashed Runs (${crashed.length})`);
            if (crashed.length > 0) {
              console.log(toYAML(output).trim());
            } else {
              console.log("No crashed runs");
            }
            return true;
          }

          default:
            console.error(
              `Unknown subcommand: ${subcommand}\n\nAvailable commands:\n  agent-yes runs list [limit]\n  agent-yes runs active\n  agent-yes runs crashed`,
            );
            return false;
        }
      }

      case "help":
      case "--help":
      case "-h": {
        if (subcommand === "db" || subcommand === "database") {
          console.log(`Database Query Commands:

Projects:
  agent-yes projects list [limit]    List recent projects (default: 10)
  agent-yes projects show [dir]      Show project details (default: current dir)

Runs:
  agent-yes runs list [limit]        List recent runs (default: 10)
  agent-yes runs active               List currently running processes
  agent-yes runs crashed              List crashed runs

Examples:
  agent-yes projects list 20         Show 20 most recent projects
  agent-yes projects show /path      Show project info for /path
  agent-yes runs active               Check what's currently running
  agent-yes runs crashed              See what crashed

Note: Regular CLI commands still work:
  agent-yes claude --                Run claude normally
  agent-yes gemini hello             Run gemini with prompt
`);
          return true;
        }
        return false;
      }

      default:
        // Not a database command, pass through to normal CLI
        return false;
    }
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  } finally {
    await closeDb();
  }
}
