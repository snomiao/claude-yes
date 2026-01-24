import Datastore from "@seald-io/nedb";
import { mkdir } from "fs/promises";
import path from "path";
import { logger } from "./logger.ts";

export interface PidRecord {
  pid: number;
  cli: string;
  args: string[];
  prompt?: string;
  logFile: string;
  fifoFile: string;
  status: "idle" | "active" | "exited";
  exitReason: string;
  exitCode?: number;
  startedAt: number;
  updatedAt: number;
}

export class PidStore {
  protected db!: Datastore<PidRecord>;
  private baseDir: string;

  constructor(workingDir: string) {
    this.baseDir = path.resolve(workingDir, ".agent-yes");
  }

  async init(): Promise<void> {
    await mkdir(path.join(this.baseDir, "logs"), { recursive: true });
    await mkdir(path.join(this.baseDir, "fifo"), { recursive: true });

    this.db = new Datastore<PidRecord>({
      filename: path.join(this.baseDir, "pid.jsonl"),
      autoload: true,
    });
    await this.db.loadDatabaseAsync();
    await this.cleanStaleRecords();
  }

  async registerProcess({
    pid,
    cli,
    args,
    prompt,
  }: {
    pid: number;
    cli: string;
    args: string[];
    prompt?: string;
  }): Promise<PidRecord> {
    const now = Date.now();
    const record: PidRecord = {
      pid,
      cli,
      args,
      prompt,
      logFile: this.getLogPath(pid),
      fifoFile: this.getFifoPath(pid),
      status: "active",
      exitReason: "",
      startedAt: now,
      updatedAt: now,
    };
    await this.db.insertAsync(record);
    logger.debug(`[pidStore] Registered process ${pid}`);
    return record;
  }

  async updateStatus(
    pid: number,
    status: PidRecord["status"],
    extra?: { exitReason?: string; exitCode?: number },
  ): Promise<void> {
    const update: Partial<PidRecord> = {
      status,
      updatedAt: Date.now(),
      ...extra,
    };
    await this.db.updateAsync({ pid }, { $set: update }, {});
    logger.debug(`[pidStore] Updated process ${pid} status=${status}`);
  }

  getLogPath(pid: number): string {
    return path.resolve(this.baseDir, "logs", `${pid}.log`);
  }

  getFifoPath(pid: number): string {
    return path.resolve(this.baseDir, "fifo", `${pid}.stdin`);
  }

  async cleanStaleRecords(): Promise<void> {
    const activeRecords = await this.db.findAsync({
      status: { $ne: "exited" } as any,
    });
    for (const record of activeRecords) {
      if (!this.isProcessAlive(record.pid)) {
        await this.db.updateAsync(
          { pid: record.pid },
          {
            $set: {
              status: "exited" as const,
              exitReason: "stale-cleanup",
              updatedAt: Date.now(),
            },
          },
          {},
        );
        logger.debug(`[pidStore] Cleaned stale record for PID ${record.pid}`);
      }
    }
  }

  async close(): Promise<void> {
    await this.db.compactDatafileAsync();
    logger.debug("[pidStore] Database compacted and closed");
  }

  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  static async findActiveFifo(workingDir: string): Promise<string | null> {
    const store = new PidStore(workingDir);
    await store.init();
    const records = await store.db.findAsync({ status: { $ne: "exited" } as any });
    await store.close();
    const sorted = records.sort((a, b) => b.startedAt - a.startedAt);
    return sorted[0]?.fifoFile ?? null;
  }
}
