import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Generated } from "kysely";
import { Kysely, SqliteDialect } from "kysely";

// Database schema types
export interface ProjectsTable {
	id: Generated<number>;
	dir: string; // Project directory (unique)
	cmd: string; // Command to run (e.g., "claude", "gemini")
	prompt: string | null; // Default prompt for this project
	created_at: Generated<number>; // Unix timestamp
	updated_at: Generated<number>; // Unix timestamp
	last_run_at: number | null; // Unix timestamp of last run
}

export interface RunsTable {
	id: Generated<number>;
	pid: number; // Process ID
	project_id: number; // Foreign key to projects.id
	status: "running" | "completed" | "failed" | "crashed"; // Run status
	exit_code: number | null; // Process exit code
	started_at: Generated<number>; // Unix timestamp
	ended_at: number | null; // Unix timestamp
	args: string; // JSON-encoded additional arguments
}

export interface DatabaseSchema {
	projects: ProjectsTable;
	runs: RunsTable;
}

// Database instance
let db: Kysely<DatabaseSchema> | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Detect if we're running in Bun
 */
function isBun(): boolean {
	return typeof Bun !== "undefined";
}

/**
 * Create a better-sqlite3 compatible wrapper for bun:sqlite
 */
// biome-ignore lint/suspicious/noExplicitAny: SQLite wrapper requires any for runtime compatibility
function createBunSqliteWrapper(bunDb: any) {
	return {
		prepare(sql: string) {
			const stmt = bunDb.prepare(sql);
			const isSelect =
				sql.trim().toLowerCase().startsWith("select") ||
				sql.trim().toLowerCase().includes("returning");

			// Create a statement object that matches better-sqlite3's interface
			const wrappedStmt = {
				// biome-ignore lint/suspicious/noExplicitAny: SQLite params are dynamic
				run(...params: any[]) {
					return stmt.run(...params);
				},
				// biome-ignore lint/suspicious/noExplicitAny: SQLite params are dynamic
				get(...params: any[]) {
					return stmt.get(...params);
				},
				// biome-ignore lint/suspicious/noExplicitAny: SQLite params are dynamic
				all(...params: any[]) {
					return stmt.all(...params);
				},
				// better-sqlite3 has a `reader` property that indicates if the statement returns rows
				reader: isSelect,
			};

			return wrappedStmt;
		},
		exec(sql: string) {
			return bunDb.run(sql);
		},
		close() {
			return bunDb.close();
		},
	};
}

/**
 * Get or create the database instance
 */
export function getDb(baseDir?: string): Kysely<DatabaseSchema> {
	if (db) return db;

	// Use .agent-yes directory in the current working directory or specified base
	const configDir = join(baseDir || process.cwd(), ".agent-yes");
	mkdirSync(configDir, { recursive: true });

	const dbPath = join(configDir, "store.sqlite");

	// Create SQLite database with WAL mode
	// biome-ignore lint/suspicious/noExplicitAny: Dynamic SQLite library loading
	let sqlite: any;

	if (isBun()) {
		// Bun can import synchronously
		const { Database } = require("bun:sqlite");
		const bunDb = new Database(dbPath, { create: true });
		bunDb.run("PRAGMA journal_mode = WAL;");
		// Wrap bun:sqlite to be compatible with better-sqlite3 API
		sqlite = createBunSqliteWrapper(bunDb);
	} else {
		// Node requires better-sqlite3
		const Database = require("better-sqlite3");
		sqlite = new Database(dbPath);
		sqlite.pragma("journal_mode = WAL");
	}

	// Create Kysely instance
	db = new Kysely<DatabaseSchema>({
		dialect: new SqliteDialect({
			database: sqlite,
		}),
	});

	// Initialize schema asynchronously
	initPromise = initSchema(db);

	return db;
}

/**
 * Initialize database schema
 */
async function initSchema(db: Kysely<DatabaseSchema>): Promise<void> {
	try {
		// Create projects table
		await db.schema
			.createTable("projects")
			.ifNotExists()
			.addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
			.addColumn("dir", "text", (col) => col.notNull().unique())
			.addColumn("cmd", "text", (col) => col.notNull())
			.addColumn("prompt", "text")
			.addColumn("created_at", "integer", (col) =>
				col.notNull().defaultTo(Date.now()),
			)
			.addColumn("updated_at", "integer", (col) =>
				col.notNull().defaultTo(Date.now()),
			)
			.addColumn("last_run_at", "integer")
			.execute();

		// Create runs table
		await db.schema
			.createTable("runs")
			.ifNotExists()
			.addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
			.addColumn("pid", "integer", (col) => col.notNull())
			.addColumn("project_id", "integer", (col) =>
				col.notNull().references("projects.id").onDelete("cascade"),
			)
			.addColumn("status", "text", (col) => col.notNull())
			.addColumn("exit_code", "integer")
			.addColumn("started_at", "integer", (col) =>
				col.notNull().defaultTo(Date.now()),
			)
			.addColumn("ended_at", "integer")
			.addColumn("args", "text", (col) => col.notNull().defaultTo("[]"))
			.execute();

		// Create indexes for common queries
		await db.schema
			.createIndex("idx_runs_project_id")
			.ifNotExists()
			.on("runs")
			.column("project_id")
			.execute();

		await db.schema
			.createIndex("idx_runs_status")
			.ifNotExists()
			.on("runs")
			.column("status")
			.execute();

		await db.schema
			.createIndex("idx_runs_pid")
			.ifNotExists()
			.on("runs")
			.column("pid")
			.execute();
	} catch (err: unknown) {
		// Ignore error if table already exists
		if (err instanceof Error && !err.message.includes("already exists")) {
			throw err;
		}
	}
}

/**
 * Close the database connection
 */
export async function closeDb() {
	// Wait for initialization to complete if it's in progress
	if (initPromise) {
		await initPromise;
		initPromise = null;
	}

	if (db) {
		await db.destroy();
		db = null;
	}
}

/**
 * Ensure schema is initialized before operations
 */
async function ensureInitialized() {
	if (initPromise) {
		await initPromise;
	}
}

// ============================================================================
// Projects API
// ============================================================================

/**
 * Create or update a project
 */
export async function upsertProject(params: {
	dir: string;
	cmd: string;
	prompt?: string | null;
}) {
	await ensureInitialized();
	const db = getDb();

	// Check if project exists
	const existing = await db
		.selectFrom("projects")
		.selectAll()
		.where("dir", "=", params.dir)
		.executeTakeFirst();

	if (existing) {
		// Update existing project
		return await db
			.updateTable("projects")
			.set({
				cmd: params.cmd,
				prompt: params.prompt ?? existing.prompt,
				updated_at: Date.now(),
			})
			.where("id", "=", existing.id)
			.executeTakeFirstOrThrow();
	}

	// Insert new project
	return await db
		.insertInto("projects")
		.values({
			dir: params.dir,
			cmd: params.cmd,
			prompt: params.prompt ?? null,
		})
		.executeTakeFirstOrThrow();
}

/**
 * Get project by directory
 */
export async function getProjectByDir(dir: string) {
	await ensureInitialized();
	const db = getDb();
	return await db
		.selectFrom("projects")
		.selectAll()
		.where("dir", "=", dir)
		.executeTakeFirst();
}

/**
 * Get project by ID
 */
export async function getProjectById(id: number) {
	await ensureInitialized();
	const db = getDb();
	return await db
		.selectFrom("projects")
		.selectAll()
		.where("id", "=", id)
		.executeTakeFirst();
}

/**
 * Get all projects
 */
export async function getAllProjects() {
	await ensureInitialized();
	const db = getDb();
	return await db
		.selectFrom("projects")
		.selectAll()
		.orderBy("last_run_at", "desc")
		.execute();
}

/**
 * Update project's last run timestamp
 */
export async function updateProjectLastRun(projectId: number) {
	await ensureInitialized();
	const db = getDb();
	return await db
		.updateTable("projects")
		.set({ last_run_at: Date.now() })
		.where("id", "=", projectId)
		.execute();
}

/**
 * Delete a project and all its runs
 */
export async function deleteProject(projectId: number) {
	await ensureInitialized();
	const db = getDb();
	return await db.deleteFrom("projects").where("id", "=", projectId).execute();
}

// ============================================================================
// Runs API
// ============================================================================

/**
 * Create a new run
 */
export async function createRun(params: {
	pid: number;
	project_id: number;
	args?: string[];
}) {
	await ensureInitialized();
	const db = getDb();

	const result = await db
		.insertInto("runs")
		.values({
			pid: params.pid,
			project_id: params.project_id,
			status: "running",
			args: JSON.stringify(params.args ?? []),
		})
		.executeTakeFirstOrThrow();

	// Update project's last run timestamp
	await updateProjectLastRun(params.project_id);

	return result;
}

/**
 * Get run by ID
 */
export async function getRunById(id: number) {
	await ensureInitialized();
	const db = getDb();
	const result = await db
		.selectFrom("runs")
		.selectAll()
		.where("id", "=", id)
		.executeTakeFirst();

	if (result) {
		return {
			...result,
			args: JSON.parse(result.args) as string[],
		};
	}
	return null;
}

/**
 * Get run by PID
 */
export async function getRunByPid(pid: number) {
	await ensureInitialized();
	const db = getDb();
	const result = await db
		.selectFrom("runs")
		.selectAll()
		.where("pid", "=", pid)
		.orderBy("started_at", "desc")
		.executeTakeFirst();

	if (result) {
		return {
			...result,
			args: JSON.parse(result.args) as string[],
		};
	}
	return null;
}

/**
 * Get all runs for a project
 */
export async function getProjectRuns(projectId: number) {
	await ensureInitialized();
	const db = getDb();
	const results = await db
		.selectFrom("runs")
		.selectAll()
		.where("project_id", "=", projectId)
		.orderBy("started_at", "desc")
		.execute();

	return results.map((result) => ({
		...result,
		args: JSON.parse(result.args) as string[],
	}));
}

/**
 * Get all running runs
 */
export async function getRunningRuns() {
	await ensureInitialized();
	const db = getDb();
	const results = await db
		.selectFrom("runs")
		.selectAll()
		.where("status", "=", "running")
		.execute();

	return results.map((result) => ({
		...result,
		args: JSON.parse(result.args) as string[],
	}));
}

/**
 * Get all runs
 */
export async function getAllRuns() {
	await ensureInitialized();
	const db = getDb();
	const results = await db
		.selectFrom("runs")
		.selectAll()
		.orderBy("started_at", "desc")
		.execute();

	return results.map((result) => ({
		...result,
		args: JSON.parse(result.args) as string[],
	}));
}

/**
 * Update run status
 */
export async function updateRunStatus(
	runId: number,
	status: "running" | "completed" | "failed" | "crashed",
	exitCode?: number | null,
) {
	await ensureInitialized();
	const db = getDb();
	return await db
		.updateTable("runs")
		.set({
			status,
			exit_code: exitCode ?? null,
			ended_at: status !== "running" ? Date.now() : null,
		})
		.where("id", "=", runId)
		.execute();
}

/**
 * Mark a run as crashed
 */
export async function markRunAsCrashed(runId: number) {
	return await updateRunStatus(runId, "crashed");
}

/**
 * Delete a run
 */
export async function deleteRun(runId: number) {
	await ensureInitialized();
	const db = getDb();
	return await db.deleteFrom("runs").where("id", "=", runId).execute();
}

/**
 * Delete all runs for a project
 */
export async function deleteProjectRuns(projectId: number) {
	await ensureInitialized();
	const db = getDb();
	return await db
		.deleteFrom("runs")
		.where("project_id", "=", projectId)
		.execute();
}

// ============================================================================
// Combined Queries
// ============================================================================

/**
 * Get project with its latest run
 */
export async function getProjectWithLatestRun(dir: string) {
	await ensureInitialized();

	const project = await getProjectByDir(dir);
	if (!project) return null;

	const runs = await getProjectRuns(project.id);
	const latestRun = runs[0] ?? null;

	return {
		project,
		latestRun,
		totalRuns: runs.length,
	};
}

/**
 * Get all crashed runs
 */
export async function getCrashedRuns() {
	await ensureInitialized();
	const db = getDb();
	const results = await db
		.selectFrom("runs")
		.innerJoin("projects", "projects.id", "runs.project_id")
		.select([
			"runs.id as run_id",
			"runs.pid",
			"runs.started_at",
			"runs.ended_at",
			"projects.id as project_id",
			"projects.dir",
			"projects.cmd",
		])
		.where("runs.status", "=", "crashed")
		.orderBy("runs.started_at", "desc")
		.execute();

	return results;
}
