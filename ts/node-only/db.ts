import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { Kysely, SqliteDialect } from 'kysely';
import { homedir } from 'os';
import { join } from 'path';

// Database schema types
export interface PidTable {
  id: number;
  pid: number;
  ppid: number | null;
  cli: string;
  args: string;
}

export interface Database {
  pid: PidTable;
}

// Database instance
let db: Kysely<Database> | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Get or create the database instance
 */
export function getDb(): Kysely<Database> {
  if (db) return db;

  // Create config directory if it doesn't exist
  const configDir = join(homedir(), '.config', 'cli-yes');
  mkdirSync(configDir, { recursive: true });

  const dbPath = join(configDir, 'db.sqlite');

  // Create SQLite database with WAL mode
  const sqlite = new Database(dbPath);

  // Enable WAL mode for better concurrency
  sqlite.pragma('journal_mode = WAL');

  // Create Kysely instance
  db = new Kysely<Database>({
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
async function initSchema(db: Kysely<Database>): Promise<void> {
  try {
    // Create pid table if it doesn't exist
    await db.schema
      .createTable('pid')
      .ifNotExists()
      .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
      .addColumn('pid', 'integer', (col) => col.notNull())
      .addColumn('ppid', 'integer')
      .addColumn('cli', 'text', (col) => col.notNull())
      .addColumn('args', 'text', (col) => col.notNull())
      .execute();
  } catch (err: any) {
    // Ignore error if table already exists
    if (!err.message.includes('already exists')) {
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
 * Insert a new process record
 */
export async function insertProcess(params: {
  pid: number;
  ppid: number | null;
  cli: string;
  args: string[];
}) {
  const db = getDb();
  return await db
    .insertInto('pid')
    .values({
      pid: params.pid,
      ppid: params.ppid,
      cli: params.cli,
      args: JSON.stringify(params.args),
    })
    .executeTakeFirstOrThrow();
}

/**
 * Get process by PID
 */
export async function getProcessByPid(pid: number) {
  const db = getDb();
  const result = await db
    .selectFrom('pid')
    .selectAll()
    .where('pid', '=', pid)
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
 * Get all child processes of a given PPID
 */
export async function getChildProcesses(ppid: number) {
  const db = getDb();
  const results = await db
    .selectFrom('pid')
    .selectAll()
    .where('ppid', '=', ppid)
    .execute();

  return results.map((result) => ({
    ...result,
    args: JSON.parse(result.args) as string[],
  }));
}

/**
 * Get all processes
 */
export async function getAllProcesses() {
  const db = getDb();
  const results = await db.selectFrom('pid').selectAll().execute();

  return results.map((result) => ({
    ...result,
    args: JSON.parse(result.args) as string[],
  }));
}

/**
 * Delete process by PID
 */
export async function deleteProcess(pid: number) {
  const db = getDb();
  return await db.deleteFrom('pid').where('pid', '=', pid).execute();
}

/**
 * Delete all processes
 */
export async function deleteAllProcesses() {
  const db = getDb();
  return await db.deleteFrom('pid').execute();
}
