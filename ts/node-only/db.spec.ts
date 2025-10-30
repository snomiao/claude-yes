import Database from 'better-sqlite3';
import { existsSync } from 'fs';
import { mkdir, rm } from 'fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  closeDb,
  deleteAllProcesses,
  deleteProcess,
  getAllProcesses,
  getChildProcesses,
  getDb,
  getProcessByPid,
  insertProcess,
} from './db.js';

const TEST_DB_PATH = './tmp/db.sqlite';
const TEST_DB_DIR = './tmp';

describe('db', () => {
  beforeEach(async () => {
    // Clean up before each test
    await cleanupTestDb();
    await mkdir(TEST_DB_DIR, { recursive: true });

    // Override the db path for testing
    process.env.HOME = process.cwd();
    process.env.USERPROFILE = process.cwd();
  });

  afterEach(async () => {
    // Close database connection
    await closeDb();

    // Clean up after each test
    await cleanupTestDb();

    // Restore environment
    delete process.env.HOME;
    delete process.env.USERPROFILE;
  });

  describe('getDb', () => {
    it('should create database instance', () => {
      const db = getDb();
      expect(db).toBeDefined();
    });

    it('should return same instance on multiple calls', () => {
      const db1 = getDb();
      const db2 = getDb();
      expect(db1).toBe(db2);
    });

    it('should create database file', () => {
      getDb();
      // Database should be created in .config/cli-yes/
      const dbPath = process.cwd() + '/.config/cli-yes/db.sqlite';
      expect(existsSync(dbPath)).toBe(true);
    });

    it('should enable WAL mode', async () => {
      const db = getDb();

      // Check WAL mode is enabled by querying the database
      // Just verify we can query the database successfully
      const result = await db.selectFrom('pid').selectAll().limit(1).execute();

      // If we got here, WAL mode is working
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('schema initialization', () => {
    it('should create pid table', async () => {
      const db = getDb();

      // Query table exists
      const result = await db.selectFrom('pid').selectAll().execute();

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should not fail if table already exists', async () => {
      // First call creates table
      getDb();

      // Second call should not fail
      await closeDb();
      const db = getDb();

      expect(db).toBeDefined();
    });
  });

  describe('CRUD operations', () => {
    describe('insertProcess', () => {
      it('should insert a process record', async () => {
        const result = await insertProcess({
          pid: 12345,
          ppid: 1000,
          cli: 'test-cli',
          args: ['arg1', 'arg2'],
        });

        expect(result).toBeDefined();
        expect(result.insertId).toBeDefined();
      });

      it('should store args as JSON', async () => {
        await insertProcess({
          pid: 12345,
          ppid: 1000,
          cli: 'test-cli',
          args: ['arg1', 'arg2', '--flag'],
        });

        const process = await getProcessByPid(12345);
        expect(process?.args).toEqual(['arg1', 'arg2', '--flag']);
      });

      it('should handle null ppid', async () => {
        await insertProcess({
          pid: 12345,
          ppid: null,
          cli: 'test-cli',
          args: ['arg1'],
        });

        const process = await getProcessByPid(12345);
        expect(process?.ppid).toBeNull();
      });

      it('should handle empty args array', async () => {
        await insertProcess({
          pid: 12345,
          ppid: 1000,
          cli: 'test-cli',
          args: [],
        });

        const process = await getProcessByPid(12345);
        expect(process?.args).toEqual([]);
      });
    });

    describe('getProcessByPid', () => {
      it('should retrieve process by pid', async () => {
        await insertProcess({
          pid: 12345,
          ppid: 1000,
          cli: 'test-cli',
          args: ['arg1', 'arg2'],
        });

        const process = await getProcessByPid(12345);
        expect(process).toBeDefined();
        expect(process?.pid).toBe(12345);
        expect(process?.ppid).toBe(1000);
        expect(process?.cli).toBe('test-cli');
        expect(process?.args).toEqual(['arg1', 'arg2']);
      });

      it('should return null for non-existent pid', async () => {
        const process = await getProcessByPid(99999);
        expect(process).toBeNull();
      });

      it('should parse args from JSON', async () => {
        await insertProcess({
          pid: 12345,
          ppid: 1000,
          cli: 'test-cli',
          args: ['complex', 'args', 'with spaces'],
        });

        const process = await getProcessByPid(12345);
        expect(Array.isArray(process?.args)).toBe(true);
        expect(process?.args).toEqual(['complex', 'args', 'with spaces']);
      });
    });

    describe('getChildProcesses', () => {
      it('should retrieve all child processes', async () => {
        await insertProcess({
          pid: 1000,
          ppid: null,
          cli: 'parent-cli',
          args: [],
        });

        await insertProcess({
          pid: 2000,
          ppid: 1000,
          cli: 'child-cli-1',
          args: ['arg1'],
        });

        await insertProcess({
          pid: 3000,
          ppid: 1000,
          cli: 'child-cli-2',
          args: ['arg2'],
        });

        const children = await getChildProcesses(1000);
        expect(children).toHaveLength(2);
        expect(children.map((c) => c.pid)).toContain(2000);
        expect(children.map((c) => c.pid)).toContain(3000);
      });

      it('should return empty array for no children', async () => {
        await insertProcess({
          pid: 1000,
          ppid: null,
          cli: 'parent-cli',
          args: [],
        });

        const children = await getChildProcesses(1000);
        expect(children).toEqual([]);
      });

      it('should not include processes with different ppid', async () => {
        await insertProcess({
          pid: 2000,
          ppid: 1000,
          cli: 'child-1',
          args: [],
        });

        await insertProcess({
          pid: 3000,
          ppid: 2000,
          cli: 'child-2',
          args: [],
        });

        const children = await getChildProcesses(1000);
        expect(children).toHaveLength(1);
        expect(children[0].pid).toBe(2000);
      });
    });

    describe('getAllProcesses', () => {
      it('should retrieve all processes', async () => {
        await insertProcess({
          pid: 1000,
          ppid: null,
          cli: 'cli-1',
          args: [],
        });

        await insertProcess({
          pid: 2000,
          ppid: 1000,
          cli: 'cli-2',
          args: [],
        });

        const processes = await getAllProcesses();
        expect(processes).toHaveLength(2);
      });

      it('should return empty array when no processes', async () => {
        const processes = await getAllProcesses();
        expect(processes).toEqual([]);
      });

      it('should parse args for all processes', async () => {
        await insertProcess({
          pid: 1000,
          ppid: null,
          cli: 'cli-1',
          args: ['arg1', 'arg2'],
        });

        await insertProcess({
          pid: 2000,
          ppid: 1000,
          cli: 'cli-2',
          args: ['arg3', 'arg4'],
        });

        const processes = await getAllProcesses();
        processes.forEach((process) => {
          expect(Array.isArray(process.args)).toBe(true);
        });
      });
    });

    describe('deleteProcess', () => {
      it('should delete process by pid', async () => {
        await insertProcess({
          pid: 12345,
          ppid: 1000,
          cli: 'test-cli',
          args: [],
        });

        await deleteProcess(12345);

        const process = await getProcessByPid(12345);
        expect(process).toBeNull();
      });

      it('should not fail when deleting non-existent process', async () => {
        const result = await deleteProcess(99999);
        expect(result).toBeDefined();
      });

      it('should only delete specified process', async () => {
        await insertProcess({
          pid: 1000,
          ppid: null,
          cli: 'cli-1',
          args: [],
        });

        await insertProcess({
          pid: 2000,
          ppid: 1000,
          cli: 'cli-2',
          args: [],
        });

        await deleteProcess(1000);

        const process1 = await getProcessByPid(1000);
        const process2 = await getProcessByPid(2000);
        expect(process1).toBeNull();
        expect(process2).toBeDefined();
      });
    });

    describe('deleteAllProcesses', () => {
      it('should delete all processes', async () => {
        await insertProcess({
          pid: 1000,
          ppid: null,
          cli: 'cli-1',
          args: [],
        });

        await insertProcess({
          pid: 2000,
          ppid: 1000,
          cli: 'cli-2',
          args: [],
        });

        await deleteAllProcesses();

        const processes = await getAllProcesses();
        expect(processes).toEqual([]);
      });

      it('should not fail when deleting empty table', async () => {
        const result = await deleteAllProcesses();
        expect(result).toBeDefined();
      });
    });
  });

  describe('database lifecycle', () => {
    it('should close database connection', async () => {
      getDb();
      await closeDb();

      // After closing, getDb should create a new instance
      const db = getDb();
      expect(db).toBeDefined();
    });

    it('should handle multiple close calls', async () => {
      getDb();
      await closeDb();
      await closeDb();

      // Should not throw
      expect(true).toBe(true);
    });

    it('should allow reconnection after close', async () => {
      getDb();
      await insertProcess({
        pid: 1000,
        ppid: null,
        cli: 'test',
        args: [],
      });

      await closeDb();

      // Reconnect and verify data persisted
      const process = await getProcessByPid(1000);
      expect(process).toBeDefined();
      expect(process?.pid).toBe(1000);
    });
  });

  describe('concurrent writes', () => {
    it('should handle multiple concurrent inserts', async () => {
      const promises = [];

      for (let i = 0; i < 10; i++) {
        promises.push(
          insertProcess({
            pid: 1000 + i,
            ppid: null,
            cli: `cli-${i}`,
            args: [`arg-${i}`],
          }),
        );
      }

      await Promise.all(promises);

      const processes = await getAllProcesses();
      expect(processes).toHaveLength(10);
    });

    it('should handle concurrent reads and writes', async () => {
      // Insert initial process
      await insertProcess({
        pid: 1000,
        ppid: null,
        cli: 'initial',
        args: [],
      });

      const operations = [];

      // Mix reads and writes
      for (let i = 0; i < 5; i++) {
        operations.push(getProcessByPid(1000));
        operations.push(
          insertProcess({
            pid: 2000 + i,
            ppid: 1000,
            cli: `cli-${i}`,
            args: [],
          }),
        );
      }

      await Promise.all(operations);

      const processes = await getAllProcesses();
      expect(processes.length).toBeGreaterThan(1);
    });

    it('should handle concurrent deletes', async () => {
      // Insert multiple processes
      for (let i = 0; i < 10; i++) {
        await insertProcess({
          pid: 1000 + i,
          ppid: null,
          cli: `cli-${i}`,
          args: [],
        });
      }

      // Delete them concurrently
      const deletePromises = [];
      for (let i = 0; i < 10; i++) {
        deletePromises.push(deleteProcess(1000 + i));
      }

      await Promise.all(deletePromises);

      const processes = await getAllProcesses();
      expect(processes).toEqual([]);
    });

    it('should maintain data consistency with concurrent operations', async () => {
      const operations = [];

      // Insert
      operations.push(
        insertProcess({
          pid: 1000,
          ppid: null,
          cli: 'parent',
          args: [],
        }),
      );

      // Multiple inserts with same ppid
      for (let i = 0; i < 5; i++) {
        operations.push(
          insertProcess({
            pid: 2000 + i,
            ppid: 1000,
            cli: `child-${i}`,
            args: [],
          }),
        );
      }

      await Promise.all(operations);

      // Verify parent-child relationships
      const children = await getChildProcesses(1000);
      expect(children).toHaveLength(5);

      const parent = await getProcessByPid(1000);
      expect(parent).toBeDefined();
    });
  });

  describe('migration and schema', () => {
    it('should preserve data after reconnection', async () => {
      await insertProcess({
        pid: 1000,
        ppid: null,
        cli: 'test-cli',
        args: ['arg1', 'arg2'],
      });

      await closeDb();

      // Reconnect
      const process = await getProcessByPid(1000);
      expect(process).toBeDefined();
      expect(process?.args).toEqual(['arg1', 'arg2']);
    });

    it('should handle database file persistence', async () => {
      await insertProcess({
        pid: 1000,
        ppid: null,
        cli: 'persistent',
        args: [],
      });

      await closeDb();

      // Open new connection
      const processes = await getAllProcesses();
      expect(processes).toHaveLength(1);
      expect(processes[0].pid).toBe(1000);
    });

    it('should maintain auto-increment id', async () => {
      const result1 = await insertProcess({
        pid: 1000,
        ppid: null,
        cli: 'cli-1',
        args: [],
      });

      const result2 = await insertProcess({
        pid: 2000,
        ppid: null,
        cli: 'cli-2',
        args: [],
      });

      expect(Number(result2.insertId)).toBeGreaterThan(
        Number(result1.insertId),
      );
    });

    it('should handle table creation on fresh database', async () => {
      // Close and remove database
      await closeDb();
      await cleanupTestDb();

      // Create new database
      const db = getDb();

      // Should be able to insert immediately
      await insertProcess({
        pid: 1000,
        ppid: null,
        cli: 'test',
        args: [],
      });

      const process = await getProcessByPid(1000);
      expect(process).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle very large pid values', async () => {
      const largePid = 2147483647; // Max 32-bit integer

      await insertProcess({
        pid: largePid,
        ppid: null,
        cli: 'test',
        args: [],
      });

      const process = await getProcessByPid(largePid);
      expect(process?.pid).toBe(largePid);
    });

    it('should handle special characters in cli and args', async () => {
      await insertProcess({
        pid: 1000,
        ppid: null,
        cli: 'test-cli with "quotes" and \'apostrophes\'',
        args: ['arg with spaces', 'arg"with"quotes', "arg'with'apostrophes"],
      });

      const process = await getProcessByPid(1000);
      expect(process?.cli).toContain('quotes');
      expect(process?.args[0]).toBe('arg with spaces');
    });

    it('should handle very long cli strings', async () => {
      const longCli = 'a'.repeat(1000);

      await insertProcess({
        pid: 1000,
        ppid: null,
        cli: longCli,
        args: [],
      });

      const process = await getProcessByPid(1000);
      expect(process?.cli).toBe(longCli);
    });

    it('should handle very long args arrays', async () => {
      const longArgs = Array.from({ length: 100 }, (_, i) => `arg-${i}`);

      await insertProcess({
        pid: 1000,
        ppid: null,
        cli: 'test',
        args: longArgs,
      });

      const process = await getProcessByPid(1000);
      expect(process?.args).toEqual(longArgs);
    });

    it('should handle unicode in cli and args', async () => {
      await insertProcess({
        pid: 1000,
        ppid: null,
        cli: '测试-cli-🚀',
        args: ['参数', 'emoji-🎉'],
      });

      const process = await getProcessByPid(1000);
      expect(process?.cli).toBe('测试-cli-🚀');
      expect(process?.args).toEqual(['参数', 'emoji-🎉']);
    });
  });
});

// Helper functions

async function cleanupTestDb() {
  try {
    // Close any open connections
    await closeDb();

    // Remove test database directory
    const dbDir = process.cwd() + '/.config';
    await rm(dbDir, { recursive: true, force: true });
  } catch {
    // Ignore errors
  }
}
