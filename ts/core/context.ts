import type { IPty } from "node-pty";
import { ReadyManager } from "../ReadyManager.ts";
import { IdleWaiter } from "../idleWaiter.ts";
import type { PidStore } from "../pidStore.ts";
import type { AgentCliConfig } from "../index.ts";
import type { SUPPORTED_CLIS } from "../SUPPORTED_CLIS.ts";
import type { LogPaths } from "./logging.ts";

/**
 * Shared context for agent session
 * Groups related state and dependencies for easier passing between modules
 */
export class AgentContext {
  // Core state
  shell: IPty;
  pidStore: PidStore;
  logPaths: LogPaths;

  // Configuration
  cli: SUPPORTED_CLIS;
  cliConf: AgentCliConfig;
  verbose: boolean;
  robust: boolean;

  // State managers
  stdinReady = new ReadyManager();
  stdinFirstReady = new ReadyManager();
  nextStdout = new ReadyManager();
  idleWaiter = new IdleWaiter();

  // Flags
  isFatal = false;
  shouldRestartWithoutContinue = false;

  constructor(params: {
    shell: IPty;
    pidStore: PidStore;
    logPaths: LogPaths;
    cli: SUPPORTED_CLIS;
    cliConf: AgentCliConfig;
    verbose: boolean;
    robust: boolean;
  }) {
    this.shell = params.shell;
    this.pidStore = params.pidStore;
    this.logPaths = params.logPaths;
    this.cli = params.cli;
    this.cliConf = params.cliConf;
    this.verbose = params.verbose;
    this.robust = params.robust;
  }

  /**
   * Get message context for sendMessage/sendEnter helpers
   */
  get messageContext() {
    return {
      shell: this.shell,
      idleWaiter: this.idleWaiter,
      stdinReady: this.stdinReady,
      nextStdout: this.nextStdout,
    };
  }
}
