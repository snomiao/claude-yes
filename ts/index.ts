import { execaCommandSync, parseCommandString } from "execa";
import { fromReadable, fromWritable } from "from-node-stream";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import DIE from "phpdie";
import sflow from "sflow";
import { TerminalTextRender } from "terminal-render";
import { catcher } from "./catcher.ts";
import {
  extractSessionId,
  getSessionForCwd,
  storeSessionForCwd,
} from "./resume/codexSessionManager.ts";
import { IdleWaiter } from "./idleWaiter.ts";
import pty, { ptyPackage } from "./pty.ts";
import { ReadyManager } from "./ReadyManager.ts";
import { removeControlCharacters } from "./removeControlCharacters.ts";
import { acquireLock, releaseLock, shouldUseLock } from "./runningLock.ts";
import { logger } from "./logger.ts";
import { createFifoStream } from "./beta/fifo.ts";
import { PidStore } from "./pidStore.ts";
import { SUPPORTED_CLIS } from "./SUPPORTED_CLIS.ts";
import winston from "winston";
import { sendEnter, sendMessage, type MessageContext } from "./core/messaging.ts";
import {
  initializeLogPaths,
  setupDebugLogging,
  saveLogFile,
  saveDeprecatedLogFile,
  type LogPaths,
} from "./core/logging.ts";
import { spawnAgent, getTerminalDimensions } from "./core/spawner.ts";
import { AgentContext } from "./core/context.ts";

export { removeControlCharacters };

export type AgentCliConfig = {
  // cli
  install?:
    | string
    | { powershell?: string; bash?: string; npm?: string; unix?: string; windows?: string }; // hint user for install command if not installed
  version?: string; // hint user for version command to check if installed
  binary?: string; // actual binary name if different from cli, e.g. cursor -> cursor-agent
  defaultArgs?: string[]; // function to ensure certain args are present

  // status detect, and actions
  ready?: RegExp[]; // regex matcher for stdin ready, or line index for gemini
  fatal?: RegExp[]; // array of regex to match for fatal errors
  exitCommands?: string[]; // commands to exit the cli gracefully
  promptArg?: (string & {}) | "first-arg" | "last-arg"; // argument name to pass the prompt, e.g. --prompt, or first-arg for positional arg

  // handle special format
  noEOL?: boolean; // if true, do not split lines by \n when handling inputs, e.g. for codex, which uses cursor-move csi code instead of \n to move lines

  // auto responds
  enter?: RegExp[]; // array of regex to match for sending Enter
  typingRespond?: { [message: string]: RegExp[] }; // type specified message to a specified pattern

  // crash/resuming-session behaviour
  restoreArgs?: string[]; // arguments to continue the session when crashed
  restartWithoutContinueArg?: RegExp[]; // array of regex to match for errors that require restart without continue args
};
export type AgentYesConfig = {
  configDir?: string; // directory to store agent-yes config files, e.g. session store
  logsDir?: string; // directory to store agent-yes log files
  clis: { [key: string]: AgentCliConfig };
};

// load user config from agent-yes.config.ts if exists
export const config = await import("../agent-yes.config.ts").then((mod) => mod.default || mod);
export const CLIS_CONFIG = config.clis as Record<
  keyof Awaited<typeof config>["clis"],
  AgentCliConfig
>;

/**
 * Main function to run agent-cli with automatic yes/no responses
 * @param options Configuration options
 * @param options.continueOnCrash - If true, automatically restart agent-cli when it crashes:
 *   1. Shows message 'agent-cli crashed, restarting..'
 *   2. Spawns a new 'agent-cli --continue' process
 *   3. Re-attaches the new process to the shell stdio (pipes new process stdin/stdout)
 *   4. If it crashes with "No conversation found to continue", exits the process
 * @param options.exitOnIdle - Exit when agent-cli is idle. Boolean or timeout in milliseconds, recommended 5000 - 60000, default is false
 * @param options.cliArgs - Additional arguments to pass to the agent-cli CLI
 * @param options.removeControlCharactersFromStdout - Remove ANSI control characters from stdout. Defaults to !process.stdout.isTTY
 * @param options.disableLock - Disable the running lock feature that prevents concurrent agents in the same directory/repo
 *
 * @example
 * ```typescript
 * import agentYes from 'agent-yes';
 * await agentYes({
 *   prompt: 'help me solve all todos in my codebase',
 *
 *   // optional
 *   cliArgs: ['--verbose'], // additional args to pass to agent-cli
 *   exitOnIdle: 30000, // exit after 30 seconds of idle
 *   robust: true, // auto restart with --continue if claude crashes, default is true
 *   logFile: 'claude-output.log', // save logs to file
 *   disableLock: false, // disable running lock (default is false)
 * });
 * ```
 */
export default async function agentYes({
  cli,
  cliArgs = [],
  prompt,
  robust = true,
  cwd,
  env,
  exitOnIdle,
  logFile,
  removeControlCharactersFromStdout = false, // = !process.stdout.isTTY,
  verbose = false,
  queue = false,
  install = false,
  resume = false,
  useSkills = false,
  useFifo = false,
}: {
  cli: SUPPORTED_CLIS;
  cliArgs?: string[];
  prompt?: string;
  robust?: boolean;
  cwd?: string;
  env?: Record<string, string>;
  exitOnIdle?: number;
  logFile?: string;
  removeControlCharactersFromStdout?: boolean;
  verbose?: boolean;
  queue?: boolean;
  install?: boolean; // if true, install the cli tool if not installed, e.g. will run `npm install -g cursor-agent`
  resume?: boolean; // if true, resume previous session in current cwd if any
  useSkills?: boolean; // if true, prepend SKILL.md header to the prompt for non-Claude agents
  useFifo?: boolean; // if true, enable FIFO input stream on Linux for additional stdin input
}) {
  // those overrides seems only works in bun
  // await Promise.allSettled([
  //   import(path.join(process.cwd(), "agent-yes.config")),
  // ])
  //   .then((e) => e.flatMap((e) => (e.status === "fulfilled" ? [e.value] : [])))
  //   .then(e=>e.at(0))
  //   .then((e) => e.default as ReturnType<typeof defineAgentYesConfig>)
  //   .then(async (override) => deepMixin(config, override || {}))
  //   .catch((error) => {
  //     if (process.env.VERBOSE)
  //       console.warn("Fail to load agent-yes.config.ts", error);
  //   });

  if (!cli) throw new Error(`cli is required`);
  const conf =
    CLIS_CONFIG[cli] ||
    DIE(`Unsupported cli tool: ${cli}, current process.argv: ${process.argv.join(" ")}`);

  // Acquire lock before starting agent (if in git repo or same cwd and lock is not disabled)
  const workingDir = cwd ?? process.cwd();
  if (queue) {
    if (queue && shouldUseLock(workingDir)) {
      await acquireLock(workingDir, prompt ?? "Interactive session");
    }

    // Register cleanup handlers for lock release
    const cleanupLock = async () => {
      if (queue && shouldUseLock(workingDir)) {
        await releaseLock().catch(() => null); // Ignore errors during cleanup
      }
    };

    process.on("exit", () => {
      if (queue) releaseLock().catch(() => null);
    });
    process.on("SIGINT", async (code) => {
      await cleanupLock();
      process.exit(code);
    });
    process.on("SIGTERM", async (code) => {
      await cleanupLock();
      process.exit(code);
    });
  }

  // Initialize process registry
  const pidStore = new PidStore(workingDir);
  await pidStore.init();

  process.stdin.setRawMode?.(true); // must be called any stdout/stdin usage

  const shellOutputStream = new TransformStream<string, string>();
  const outputWriter = shellOutputStream.writable.getWriter();

  logger.debug(`Using ${ptyPackage} for pseudo terminal management.`);

  // Detect if running as sub-agent
  const isSubAgent = !!process.env.CLAUDE_PPID;
  if (isSubAgent)
    logger.info(`[${cli}-yes] Running as sub-agent (CLAUDE_PPID=${process.env.CLAUDE_PPID})`);

  // Apply CLI specific configurations (moved to CLI_CONFIGURES)
  const cliConf = (CLIS_CONFIG as Record<string, AgentCliConfig>)[cli] || {};
  cliArgs = cliConf.defaultArgs ? [...cliConf.defaultArgs, ...cliArgs] : cliArgs;

  // If enabled, read SKILL.md header and prepend to the prompt for non-Claude agents
  try {
    const workingDir = cwd ?? process.cwd();
    if (useSkills && cli !== "claude") {
      // Find git root to determine search boundary
      let gitRoot: string | null = null;
      try {
        const result = execaCommandSync("git rev-parse --show-toplevel", {
          cwd: workingDir,
          reject: false,
        });
        if (result.exitCode === 0) {
          gitRoot = result.stdout.trim();
        }
      } catch {
        // Not a git repo, will only check cwd
      }

      // Walk up from cwd to git root (or stop at filesystem root) collecting SKILL.md files
      const skillHeaders: string[] = [];
      let currentDir = workingDir;
      const searchLimit = gitRoot || path.parse(currentDir).root;

      while (true) {
        const skillPath = path.resolve(currentDir, "SKILL.md");
        const md = await readFile(skillPath, "utf8").catch(() => null);
        if (md) {
          // Extract header (content before first level-2 heading `## `)
          const headerMatch = md.match(/^[\s\S]*?(?=\n##\s)/);
          const headerRaw = (headerMatch ? headerMatch[0] : md).trim();
          if (headerRaw) {
            skillHeaders.push(headerRaw);
            if (verbose)
              logger.info(`[skills] Found SKILL.md in ${currentDir} (${headerRaw.length} chars)`);
          }
        }

        // Stop if we've reached git root or filesystem root
        if (currentDir === searchLimit) break;

        const parentDir = path.dirname(currentDir);
        if (parentDir === currentDir) break; // Reached filesystem root
        currentDir = parentDir;
      }

      if (skillHeaders.length > 0) {
        // Combine all headers (most specific first)
        const combined = skillHeaders.join("\n\n---\n\n");
        const MAX = 2000; // increased limit for multiple skills
        const header = combined.length > MAX ? combined.slice(0, MAX) + "…" : combined;
        const prefix = `Use this repository skill as context:\n\n${header}`;
        prompt = prompt ? `${prefix}\n\n${prompt}` : prefix;
        if (verbose)
          logger.info(
            `[skills] Injected ${skillHeaders.length} SKILL.md header(s) (${header.length} chars total)`,
          );
      } else {
        if (verbose) logger.info("[skills] No SKILL.md found in directory hierarchy");
      }
    }
  } catch (error) {
    // Non-fatal; continue without skills
    if (verbose) logger.warn("[skills] Failed to inject SKILL.md header:", { error });
  }

  // Handle --continue flag for codex session restoration
  if (resume) {
    if (cli === "codex" && resume) {
      // Try to get stored session for this directory
      const storedSessionId = await getSessionForCwd(workingDir);
      if (storedSessionId) {
        // Replace or add resume args
        cliArgs = ["resume", storedSessionId, ...cliArgs];
        await logger.debug(`resume|using stored session ID: ${storedSessionId}`);
      } else {
        throw new Error(
          `No stored session found for codex in directory: ${workingDir}, please try without resume option.`,
        );
      }
    } else if (cli === "claude") {
      // just add --continue flag for claude
      cliArgs = ["--continue", ...cliArgs];
      await logger.debug(`resume|adding --continue flag for claude`);
    } else if (cli === "gemini") {
      // Gemini supports session resume natively via --resume flag
      // Sessions are project/directory-specific by default (stored in ~/.gemini/tmp/<project_hash>/chats/)
      cliArgs = ["--resume", ...cliArgs];
      await logger.debug(`resume|adding --resume flag for gemini`);
    } else {
      throw new Error(
        `Resume option is not supported for cli: ${cli}, make a feature request if you want it. https://github.com/snomiao/agent-yes/issues`,
      );
    }
  }

  // If possible pass prompt via cli args, its usually faster than stdin
  if (prompt && cliConf.promptArg) {
    if (cliConf.promptArg === "first-arg") {
      cliArgs = [prompt, ...cliArgs];
      prompt = undefined; // clear prompt to avoid sending later
    } else if (cliConf.promptArg === "last-arg") {
      cliArgs = [...cliArgs, prompt];
      prompt = undefined; // clear prompt to avoid sending later
    } else if (cliConf.promptArg.startsWith("--")) {
      cliArgs = [cliConf.promptArg, prompt, ...cliArgs];
      prompt = undefined; // clear prompt to avoid sending later
    } else {
      logger.warn(`Unknown promptArg format: ${cliConf.promptArg}`);
    }
  }

  // Spawn the agent CLI process
  const ptyEnv = { ...(env ?? (process.env as Record<string, string>)) };
  const ptyOptions = {
    name: "xterm-color",
    ...getTerminalDimensions(),
    cwd: cwd ?? process.cwd(),
    env: ptyEnv,
  };

  let shell = spawnAgent({
    cli,
    cliConf,
    cliArgs,
    verbose,
    install,
    ptyOptions,
  });

  // Register process in pidStore and compute log paths
  await pidStore.registerProcess({ pid: shell.pid, cli, args: cliArgs, prompt });
  const logPaths = initializeLogPaths(pidStore, shell.pid);
  setupDebugLogging(logPaths.debuggingLogsPath);

  // Create agent context
  const ctx = new AgentContext({
    shell,
    pidStore,
    logPaths,
    cli,
    cliConf,
    verbose,
    robust,
  });

  // force ready after 10s to avoid stuck forever if the ready-word mismatched
  sleep(10e3).then(() => {
    if (!ctx.stdinReady.isReady) ctx.stdinReady.ready();
    if (!ctx.stdinFirstReady.isReady) ctx.stdinFirstReady.ready();
  });

  const pendingExitCode = Promise.withResolvers<number | null>();

  async function onData(data: string) {
    // append data to the buffer, so we can process it later
    await outputWriter.write(data);
  }

  shell.onData(onData);
  shell.onExit(async function onExit({ exitCode }) {
    ctx.stdinReady.unready(); // start buffer stdin
    const agentCrashed = exitCode !== 0;

    // Handle restart without continue args (e.g., "No conversation found to continue")
    // logger.debug(``, { shouldRestartWithoutContinue, robust })
    if (ctx.shouldRestartWithoutContinue) {
      await pidStore.updateStatus(shell.pid, "exited", {
        exitReason: "restarted",
        exitCode: exitCode ?? undefined,
      });
      ctx.shouldRestartWithoutContinue = false; // reset flag
      ctx.isFatal = false; // reset fatal flag to allow restart

      // Restart without continue args - use original cliArgs without restoreArgs
      const cliCommand = cliConf?.binary || cli;
      let [bin, ...args] = [
        ...parseCommandString(cliCommand),
        ...cliArgs.filter((arg) => !["--continue", "--resume"].includes(arg)),
      ];
      logger.info(`Restarting ${cli} ${JSON.stringify([bin, ...args])}`);

      shell = pty.spawn(bin!, args, getPtyOptions());
      await pidStore.registerProcess({ pid: shell.pid, cli, args, prompt });
      shell.onData(onData);
      shell.onExit(onExit);
      return;
    }

    if (agentCrashed && robust && conf?.restoreArgs) {
      if (!conf.restoreArgs) {
        logger.warn(
          `robust is only supported for ${Object.entries(CLIS_CONFIG)
            .filter(([_, v]) => v.restoreArgs)
            .map(([k]) => k)
            .join(", ")} currently, not ${cli}`,
        );
        return;
      }
      if (ctx.isFatal) {
        await pidStore.updateStatus(shell.pid, "exited", {
          exitReason: "fatal",
          exitCode: exitCode ?? undefined,
        });
        return pendingExitCode.resolve(exitCode);
      }

      await pidStore.updateStatus(shell.pid, "exited", {
        exitReason: "restarted",
        exitCode: exitCode ?? undefined,
      });
      logger.info(`${cli} crashed, restarting...`);

      // For codex, try to use stored session ID for this directory
      let restoreArgs = conf.restoreArgs;
      if (cli === "codex") {
        const storedSessionId = await getSessionForCwd(workingDir);
        if (storedSessionId) {
          // Use specific session ID instead of --last
          restoreArgs = ["resume", storedSessionId];
          logger.debug(`restore|using stored session ID: ${storedSessionId}`);
        } else {
          logger.debug(`restore|no stored session, using default restore args`);
        }
      }

      shell = pty.spawn(cli, restoreArgs, getPtyOptions());
      await pidStore.registerProcess({ pid: shell.pid, cli, args: restoreArgs, prompt });
      shell.onData(onData);
      shell.onExit(onExit);
      return;
    }
    const exitReason = agentCrashed ? "crash" : "normal";
    await pidStore.updateStatus(shell.pid, "exited", {
      exitReason,
      exitCode: exitCode ?? undefined,
    });
    return pendingExitCode.resolve(exitCode);
  });

  // when current tty resized, resize the pty too
  process.stdout.on("resize", () => {
    const { cols, rows } = getTerminalDimensions(); // minimum 80 columns to avoid layout issues
    shell.resize(cols, rows); // minimum 80 columns to avoid layout issues
  });

  const terminalRender = new TerminalTextRender();
  const isStillWorkingQ = () =>
    terminalRender
      .render()
      .replace(/\s+/g, " ")
      .match(/esc to interrupt|to run in background/);

  if (exitOnIdle)
    ctx.idleWaiter.wait(exitOnIdle).then(async () => {
      await pidStore.updateStatus(shell.pid, "idle").catch(() => null);
      if (isStillWorkingQ()) {
        logger.warn("[${cli}-yes] ${cli} is idle, but seems still working, not exiting yet");
        return;
      }

      logger.info("[${cli}-yes] ${cli} is idle, exiting...");
      await exitAgent();
    });

  // Message streaming

  // Message streaming with stdin and optional FIFO (Linux only)

  await sflow(fromReadable<Buffer>(process.stdin))
    .map((buffer) => buffer.toString())

    .by(function handleTerminateSignals(s) {
      let aborted = false;
      return s.map((chunk) => {
        // handle CTRL+Z and filter it out, as I dont know how to support it yet
        if (!aborted && chunk === "\u001A") {
          return "";
        }
        // handle CTRL+C, when stdin is not ready (no response from agent yet, usually this is when agent loading)
        if (!aborted && !ctx.stdinReady.isReady && chunk === "\u0003") {
          logger.error("User aborted: SIGINT");
          shell.kill("SIGINT");
          pendingExitCode.resolve(130); // SIGINT
          aborted = true;
          return chunk; // still pass into agent, but they prob be killed XD
        }
        return chunk; // normal inputs
      });
    })

    // read from IPC stream if available (FIFO on Linux, Named Pipes on Windows)
    .by((s) => {
      if (!useFifo) return s;
      const ipcResult = createFifoStream(cli, pidStore.getFifoPath(shell.pid));
      if (!ipcResult) return s;
      pendingExitCode.promise.finally(() => ipcResult.cleanup());
      process.stderr.write(`\n  Append prompts: ${cli}-yes --append-prompt '...'\n\n`);
      return s.merge(ipcResult.stream);
    })

    // .map((e) => e.replaceAll('\x1a', '')) // remove ctrl+z from user's input, to prevent bug (but this seems bug)
    // .forEach(e => appendFile('.cache/io.log', "input |" + JSON.stringify(e) + '\n')) // for debugging

    .onStart(async function promptOnStart() {
      // send prompt when start
      logger.debug("Sending prompt message: " + JSON.stringify(prompt));
      if (prompt) await sendMessage(ctx.messageContext, prompt);
    })

    // pipe content by shell
    .by({
      writable: new WritableStream<string>({
        write: async (data) => {
          await ctx.stdinReady.wait();
          shell.write(data);
        },
      }),
      readable: shellOutputStream.readable,
    })

    .forEach(() => {
      ctx.idleWaiter.ping();
      pidStore.updateStatus(shell.pid, "active").catch(() => null);
    })
    .forEach(() => ctx.nextStdout.ready())

    .forkTo(async function rawLogger(f) {
      if (!ctx.logPaths.rawLogPath) return f.run(); // no stream

      // try stream the raw log for realtime debugging, including control chars, note: it will be a huge file
      return await mkdir(path.dirname(ctx.logPaths.rawLogPath), { recursive: true })
        .then(() => {
          logger.debug(`[${cli}-yes] raw logs streaming to ${ctx.logPaths.rawLogPath}`);
          return f
            .forEach(async (chars) => {
              await writeFile(ctx.logPaths.rawLogPath!, chars, { flag: "a" }).catch(() => null);
            })
            .run();
        })
        .catch(() => f.run());
    })

    // handle cursor position requests and render terminal output
    .by(function consoleResponder(e) {
      // wait for cli ready and send prompt if provided
      if (cli === "codex") shell.write(`\u001b[1;1R`); // send cursor position response when stdin is not tty
      return e.forEach((text) => {
        // render terminal output for log file
        terminalRender.write(text);

        // Handle Device Attributes query (DA) - ESC[c or ESC[0c
        // This must be handled regardless of TTY status
        if (text.includes("\u001b[c") || text.includes("\u001b[0c")) {
          // Respond shell with VT100 with Advanced Video Option
          shell.write("\u001b[?1;2c");
          if (verbose) {
            logger.debug("device|respond DA: VT100 with Advanced Video Option");
          }
          return;
        }

        // todo: .onStatus((msg)=> shell.write(msg))
        if (process.stdin.isTTY) return; // only handle it when stdin is not tty, because tty already handled this

        if (!text.includes("\u001b[6n")) return; // only asked for cursor position
        // todo: use terminalRender API to get cursor position when new version is available
        // xterm replies CSI row; column R if asked cursor position
        // https://en.wikipedia.org/wiki/ANSI_escape_code#:~:text=citation%20needed%5D-,xterm%20replies,-CSI%20row%C2%A0%3B
        // when agent asking position, respond with row; col
        // const rendered = terminalRender.render();
        const { col, row } = terminalRender.getCursorPosition();
        shell.write(`\u001b[${row};${col}R`); // reply cli when getting cursor position
        logger.debug(`cursor|respond position: row=${String(row)}, col=${String(col)}`);
        // const row = rendered.split('\n').length + 1;
        // const col = (rendered.split('\n').slice(-1)[0]?.length || 0) + 1;
      });
    })

    // auto-response
    .forkTo(function autoResponse(e) {
      return (
        e
          .map((e) => removeControlCharacters(e))
          // .map((e) => e.replaceAll("\r", "")) // remove carriage return
          .by((s) => {
            if (conf.noEOL) return s; // codex use cursor-move csi code insteadof \n to move lines, so the output have no \n at all, this hack prevents stuck on unended line
            return s.lines({ EOL: "NONE" }); // other clis use ink, which is rerendering the block based on \n lines
          })

          // .forkTo(async function rawLinesLogger(f) {
          //   if (!rawLinesLogPath) return f.run(); // no stream
          //   // try stream the raw log for realtime debugging, including control chars, note: it will be a huge file
          //   return await mkdir(path.dirname(rawLinesLogPath), { recursive: true })
          //     .then(() => {
          //       logger.debug(`[${cli}-yes] raw lines logs streaming to ${rawLinesLogPath}`);
          //       return f
          //         .forEach(async (chars, i) => {
          //           await writeFile(rawLinesLogPath, `L${i}|` + chars, { flag: "a" }).catch(() => null);
          //         })
          //         .run();
          //     })
          //     .catch(() => f.run());
          // })

          // Generic auto-response handler driven by CLI_CONFIGURES
          .forEach(async function autoResponseOnChunk(e, i) {
            logger.debug(`stdout|${e}`);
            // ready matcher: if matched, mark stdin ready
            if (conf.ready?.some((rx: RegExp) => e.match(rx))) {
              logger.debug(`ready |${e}`);
              if (cli === "gemini" && i <= 80) return; // gemini initial noise, only after many lines
              ctx.stdinReady.ready();
              ctx.stdinFirstReady.ready();
            }
            // enter matchers: send Enter when any enter regex matches

            if (conf.enter?.some((rx: RegExp) => e.match(rx))) {
              logger.debug(`enter |${e}`);
              return await sendEnter(ctx.messageContext, 400); // wait for idle for a short while and then send Enter
            }

            // typingRespond matcher: if matched, send the specified message
            const typingResponded = await sflow(Object.entries(conf.typingRespond ?? {}))
              .filter(([_sendString, onThePatterns]) => onThePatterns.some((rx) => e.match(rx)))
              .map(
                async ([sendString]) =>
                  await sendMessage(ctx.messageContext, sendString, { waitForReady: false }),
              )
              .toCount();
            if (typingResponded) return;

            // fatal matchers: set isFatal flag when matched
            if (conf.fatal?.some((rx: RegExp) => e.match(rx))) {
              logger.debug(`fatal |${e}`);
              ctx.isFatal = true;
              await exitAgent();
            }

            // restartWithoutContinueArg matchers: set flag to restart without continue args
            if (conf.restartWithoutContinueArg?.some((rx: RegExp) => e.match(rx))) {
              await logger.debug(`restart-without-continue|${e}`);
              ctx.shouldRestartWithoutContinue = true;
              ctx.isFatal = true; // also set fatal to trigger exit
              await exitAgent();
            }

            // session ID capture for codex
            if (cli === "codex") {
              const sessionId = extractSessionId(e);
              if (sessionId) {
                await logger.debug(`session|captured session ID: ${sessionId}`);
                await storeSessionForCwd(workingDir, sessionId);
              }
            }
          })
          .run()
      );
    })
    .by((s) => (removeControlCharactersFromStdout ? s.map((e) => removeControlCharacters(e)) : s))

    // terminate whole stream when shell did exited (already crash-handled)
    .by(
      new TransformStream({
        start: function terminator(ctrl) {
          pendingExitCode.promise.then(() => ctrl.terminate());
        },
        transform: (e, ctrl) => ctrl.enqueue(e),
        flush: (ctrl) => ctrl.terminate(),
      }),
    )
    .to(fromWritable(process.stdout));

  await saveLogFile(ctx.logPaths.logPath, terminalRender.render());

  // and then get its exitcode
  const exitCode = await pendingExitCode.promise;
  logger.info(`[${cli}-yes] ${cli} exited with code ${exitCode}`);

  // Final pidStore cleanup
  await pidStore.close();

  // Update task status.writable release lock
  await outputWriter.close();

  // deprecated logFile option, we have logPath now, but keep for backward compatibility
  await saveDeprecatedLogFile(logFile, terminalRender.render(), verbose);

  return { exitCode, logs: terminalRender.render() };

  async function exitAgent() {
    ctx.robust = false; // disable robust to avoid auto restart

    // send exit command to the shell, must sleep a bit to avoid claude treat it as pasted input
    for (const cmd of cliConf.exitCommands ?? ["/exit"]) await sendMessage(ctx.messageContext, cmd);

    // wait for shell to exit or kill it with a timeout
    let exited = false;
    await Promise.race([
      pendingExitCode.promise.then(() => (exited = true)), // resolve when shell exits

      // if shell doesn't exit in 5 seconds, kill it
      new Promise<void>((resolve) =>
        setTimeout(() => {
          if (exited) return; // if shell already exited, do nothing
          shell.kill(); // kill the shell process if it doesn't exit in time
          resolve();
        }, 5000),
      ), // 5 seconds timeout
    ]);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
