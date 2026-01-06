import { execaCommand, execaCommandSync, parseCommandString } from 'execa';
import { fromReadable, fromWritable } from 'from-node-stream';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path, { dirname } from 'path';
import DIE from 'phpdie';
import sflow from 'sflow';
import { TerminalTextRender } from 'terminal-render';
import { fileURLToPath, pathToFileURL } from 'url';
import rawConfig from '../cli-yes.config.js';
import { catcher } from './catcher.js';
import {
  extractSessionId,
  getSessionForCwd,
  storeSessionForCwd,
} from './codexSessionManager.js';
import { IdleWaiter } from './idleWaiter';
import pty, { ptyPackage } from './pty';
import { ReadyManager } from './ReadyManager';
import { removeControlCharacters } from './removeControlCharacters';
import {
  acquireLock,
  releaseLock,
  shouldUseLock,
  updateCurrentTaskStatus,
} from './runningLock';
import { yesLog } from './yesLog';

export { parseCliArgs } from './parseCliArgs';
export { removeControlCharacters };

export type AgentCliConfig = {
  install?: string; // hint user for install command if not installed
  version?: string; // hint user for version command to check if installed
  binary?: string; // actual binary name if different from cli, e.g. cursor -> cursor-agent
  ready?: RegExp[]; // regex matcher for stdin ready, or line index for gemini
  enter?: RegExp[]; // array of regex to match for sending Enter
  fatal?: RegExp[]; // array of regex to match for fatal errors
  restoreArgs?: string[]; // arguments to continue the session when crashed
  defaultArgs?: string[]; // function to ensure certain args are present
  noEOL?: boolean; // if true, do not split lines by \n, used for codex, which uses cursor-move csi code instead of \n to move lines
  promptArg?: (string & {}) | 'first-arg' | 'last-arg'; // argument name to pass the prompt, e.g. --prompt, or first-arg for positional arg
  exitCommands?: string[]; // commands to exit the cli gracefully
};
export type CliYesConfig = {
  configDir?: string; // directory to store cli-yes config files, e.g. session store
  clis: { [key: string]: AgentCliConfig };
};

// load user config from cli-yes.config.ts if exists
export const config = await rawConfig;

export const CLIS_CONFIG = config.clis as Record<
  keyof Awaited<typeof config>['clis'],
  AgentCliConfig
>;
export type SUPPORTED_CLIS = keyof typeof CLIS_CONFIG;
export const SUPPORTED_CLIS = Object.keys(CLIS_CONFIG) as SUPPORTED_CLIS[];

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
 * import cliYes from 'cli-yes';
 * await cliYes({
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
export default async function cliYes({
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
}) {
  // those overrides seems only works in bun
  // await Promise.allSettled([
  //   import(path.join(process.cwd(), "cli-yes.config")),
  // ])
  //   .then((e) => e.flatMap((e) => (e.status === "fulfilled" ? [e.value] : [])))
  //   .then(e=>e.at(0))
  //   .then((e) => e.default as ReturnType<typeof defineCliYesConfig>)
  //   .then(async (override) => deepMixin(config, override || {}))
  //   .catch((error) => {
  //     if (process.env.VERBOSE)
  //       console.warn("Fail to load cli-yes.config.ts", error);
  //   });

  if (!cli) throw new Error(`cli is required`);
  const conf =
    CLIS_CONFIG[cli] ||
    DIE(
      `Unsupported cli tool: ${cli}, current process.argv: ${process.argv.join(' ')}`,
    );

  // Acquire lock before starting agent (if in git repo or same cwd and lock is not disabled)
  const workingDir = cwd ?? process.cwd();
  if (queue) {
    if (queue && shouldUseLock(workingDir)) {
      await acquireLock(workingDir, prompt ?? 'Interactive session');
    }

    // Register cleanup handlers for lock release
    const cleanupLock = async () => {
      if (queue && shouldUseLock(workingDir)) {
        await releaseLock().catch(() => null); // Ignore errors during cleanup
      }
    };

    process.on('exit', () => {
      if (queue) releaseLock().catch(() => null);
    });
    process.on('SIGINT', async (code) => {
      await cleanupLock();
      process.exit(code);
    });
    process.on('SIGTERM', async (code) => {
      await cleanupLock();
      process.exit(code);
    });
  }

  process.stdin.setRawMode?.(true); // must be called any stdout/stdin usage
  let isFatal = false; // when true, do not restart on crash, and exit agent

  const stdinReady = new ReadyManager();

  // force ready after 10s to avoid stuck forever if the ready-word mismatched
  sleep(10e3).then(() => {
    if (!stdinReady.isReady) stdinReady.ready();
  });
  const nextStdout = new ReadyManager();

  const shellOutputStream = new TransformStream<string, string>();
  const outputWriter = shellOutputStream.writable.getWriter();

  console.log(`Using ${ptyPackage} for pseudo terminal management.`);

  const datetime = new Date().toISOString().replace(/\D/g, '').slice(0, 17);
  const logPath =
    config.configDir &&
    path.resolve(config.configDir, 'logs', `${cli}-yes-${datetime}.log`);
  const rawLogPath =
    config.configDir &&
    path.resolve(config.configDir, 'logs', `${cli}-yes-${datetime}.raw.log`);

  // Detect if running as sub-agent
  const isSubAgent = !!process.env.CLAUDE_PPID;
  if (isSubAgent) {
    console.log(
      `[${cli}-yes] Running as sub-agent (CLAUDE_PPID=${process.env.CLAUDE_PPID})`,
    );
  }

  const getPtyOptions = () => ({
    name: 'xterm-color',
    ...getTerminalDimensions(),
    cwd: cwd ?? process.cwd(),
    env: {
      ...(env ?? (process.env as Record<string, string>)),
      CLAUDE_PPID: String(process.ppid),
    },
  });

  // Apply CLI specific configurations (moved to CLI_CONFIGURES)
  const cliConf = (CLIS_CONFIG as Record<string, AgentCliConfig>)[cli] || {};
  cliArgs = cliConf.defaultArgs
    ? [...cliConf.defaultArgs, ...cliArgs]
    : cliArgs;

  // If enabled, read SKILL.md header and prepend to the prompt for non-Claude agents
  try {
    const workingDir = cwd ?? process.cwd();
    if (useSkills && cli !== 'claude') {
      // Find git root to determine search boundary
      let gitRoot: string | null = null;
      try {
        const result = execaCommandSync('git rev-parse --show-toplevel', {
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
        const skillPath = path.resolve(currentDir, 'SKILL.md');
        const md = await readFile(skillPath, 'utf8').catch(() => null);
        if (md) {
          // Extract header (content before first level-2 heading `## `)
          const headerMatch = md.match(/^[\s\S]*?(?=\n##\s)/);
          const headerRaw = (headerMatch ? headerMatch[0] : md).trim();
          if (headerRaw) {
            skillHeaders.push(headerRaw);
            verbose &&
              console.log(
                `[skills] Found SKILL.md in ${currentDir} (${headerRaw.length} chars)`,
              );
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
        const combined = skillHeaders.join('\n\n---\n\n');
        const MAX = 2000; // increased limit for multiple skills
        const header =
          combined.length > MAX ? combined.slice(0, MAX) + '…' : combined;
        const prefix = `Use this repository skill as context:\n\n${header}`;
        prompt = prompt ? `${prefix}\n\n${prompt}` : prefix;
        verbose &&
          console.log(
            `[skills] Injected ${skillHeaders.length} SKILL.md header(s) (${header.length} chars total)`,
          );
      } else {
        verbose &&
          console.log('[skills] No SKILL.md found in directory hierarchy');
      }
    }
  } catch (error) {
    // Non-fatal; continue without skills
    verbose &&
      console.warn('[skills] Failed to inject SKILL.md header:', error);
  }

  // Handle --continue flag for codex session restoration
  if (resume) {
    if (cli === 'codex' && resume) {
      // Try to get stored session for this directory
      const storedSessionId = await getSessionForCwd(workingDir);
      if (storedSessionId) {
        // Replace or add resume args
        cliArgs = ['resume', storedSessionId, ...cliArgs];
        await yesLog`resume|using stored session ID: ${storedSessionId}`;
      } else {
        throw new Error(
          `No stored session found for codex in directory: ${workingDir}, please try without resume option.`,
        );
      }
    } else if (cli === 'claude') {
      // just add --continue flag for claude
      cliArgs = ['--continue', ...cliArgs];
      await yesLog`resume|adding --continue flag for claude`;
    } else if (cli === 'gemini') {
      // Gemini supports session resume natively via --resume flag
      // Sessions are project/directory-specific by default (stored in ~/.gemini/tmp/<project_hash>/chats/)
      cliArgs = ['--resume', ...cliArgs];
      await yesLog`resume|adding --resume flag for gemini`;
    } else {
      throw new Error(
        `Resume option is not supported for cli: ${cli}, make a feature request if you want it. https://github.com/snomiao/claude-yes/issues`,
      );
    }
  }

  // If possible pass prompt via cli args, its usually faster than stdin
  if (prompt && cliConf.promptArg) {
    if (cliConf.promptArg === 'first-arg') {
      cliArgs = [prompt, ...cliArgs];
      prompt = undefined; // clear prompt to avoid sending later
    } else if (cliConf.promptArg === 'last-arg') {
      cliArgs = [...cliArgs, prompt];
      prompt = undefined; // clear prompt to avoid sending later
    } else if (cliConf.promptArg.startsWith('--')) {
      cliArgs = [cliConf.promptArg, prompt, ...cliArgs];
      prompt = undefined; // clear prompt to avoid sending later
    } else {
      console.warn(`Unknown promptArg format: ${cliConf.promptArg}`);
    }
  }
  // Determine the actual cli command to run

  const spawn = () => {
    const cliCommand = cliConf?.binary || cli;
    // const useBunx = globalThis.Bun;
    const useBunx = !!globalThis.Bun;
    let [bin, ...args] = [
      ...parseCommandString(
        // (useBunx ? 'bunx --bun ' : '')

        cliCommand,
      ),
      ...cliArgs,
    ];
    verbose &&
      console.log(`Spawning ${bin} with args: ${JSON.stringify(args)}`);
    console.log(`Spawning ${bin} with args: ${JSON.stringify(args)}`);
    const spawned = pty.spawn(bin!, args, getPtyOptions());
    console.log(`[${cli}-yes] Spawned ${bin} with PID ${spawned.pid}`);
    // if (globalThis.Bun)
    //   args = args.map((arg) => `'${arg.replace(/'/g, "\\'")}'`);
    return spawned;
  };

  let shell = catcher(
    // error handler
    (error: unknown, fn, ...args) => {
      console.error(`Fatal: Failed to start ${cli}.`);

      if (cliConf?.install && isCommandNotFoundError(error)) {
        if (install) {
          console.log(`Attempting to install ${cli}...`);
          execaCommandSync(cliConf.install, { stdio: 'inherit' });
          console.log(
            `${cli} installed successfully. Please rerun the command.`,
          );
          return spawn();
        } else {
          console.error(
            `If you did not installed it yet, Please install it first: ${cliConf.install}`,
          );
          throw error;
        }
      }

      if (
        globalThis.Bun &&
        error instanceof Error &&
        error.stack?.includes('bun-pty')
      ) {
        // try to fix bun-pty issues
        console.error(
          `Detected bun-pty issue, attempted to fix it. Please try again.`,
        );
        require('./pty-fix');
        // unable to retry with same process, so exit here.
      }
      throw error;

      function isCommandNotFoundError(e: unknown) {
        if (e instanceof Error) {
          return (
            e.message.includes('command not found') || // unix
            e.message.includes('ENOENT') || // unix
            e.message.includes('spawn') // windows
          );
        }
        return false;
      }
    },
    spawn,
  )();
  const pendingExitCode = Promise.withResolvers<number | null>();
  let pendingExitCodeValue = null;

  async function onData(data: string) {
    // append data to the buffer, so we can process it later
    await outputWriter.write(data);
  }

  shell.onData(onData);
  shell.onExit(async function onExit({ exitCode }) {
    stdinReady.unready(); // start buffer stdin
    const agentCrashed = exitCode !== 0;

    if (agentCrashed && robust && conf?.restoreArgs) {
      if (!conf.restoreArgs) {
        return console.warn(
          `robust is only supported for ${Object.entries(CLIS_CONFIG)
            .filter(([_, v]) => v.restoreArgs)
            .map(([k]) => k)
            .join(', ')} currently, not ${cli}`,
        );
      }
      if (isFatal) {
        return pendingExitCode.resolve((pendingExitCodeValue = exitCode));
      }

      console.log(`${cli} crashed, restarting...`);

      // For codex, try to use stored session ID for this directory
      let restoreArgs = conf.restoreArgs;
      if (cli === 'codex') {
        const storedSessionId = await getSessionForCwd(workingDir);
        if (storedSessionId) {
          // Use specific session ID instead of --last
          restoreArgs = ['resume', storedSessionId];
          await yesLog`restore|using stored session ID: ${storedSessionId}`;
        } else {
          await yesLog`restore|no stored session, using default restore args`;
        }
      }

      shell = pty.spawn(cli, restoreArgs, getPtyOptions());
      shell.onData(onData);
      shell.onExit(onExit);
      return;
    }
    return pendingExitCode.resolve((pendingExitCodeValue = exitCode));
  });

  // when current tty resized, resize the pty
  process.stdout.on('resize', () => {
    const { cols, rows } = getTerminalDimensions(); // minimum 80 columns to avoid layout issues
    shell.resize(cols, rows); // minimum 80 columns to avoid layout issues
  });

  const terminalRender = new TerminalTextRender();
  const isStillWorkingQ = () =>
    terminalRender
      .render()
      .replace(/\s+/g, ' ')
      .match(/esc to interrupt|to run in background/);

  const exitIdleWaiter = new IdleWaiter();
  if (exitOnIdle)
    exitIdleWaiter.wait(exitOnIdle).then(async () => {
      if (isStillWorkingQ()) {
        console.log(
          '[${cli}-yes] ${cli} is idle, but seems still working, not exiting yet',
        );
        return;
      }

      console.log('[${cli}-yes] ${cli} is idle, exiting...');
      await exitAgent();
    });

  // console.log(
  //   `[${cli}-yes] Started ${cli} with args: ${[cliCommand, ...cliArgs].join(" ")}`
  // );
  // Message streaming

  sflow(fromReadable<Buffer>(process.stdin))
    .map((buffer) => buffer.toString())
    // .map((e) => e.replaceAll('\x1a', '')) // remove ctrl+z from user's input (seems bug)
    // .forEach(e => appendFile('.cache/io.log', "input |" + JSON.stringify(e) + '\n')) // for debugging
    // pipe
    .by({
      writable: new WritableStream<string>({
        write: async (data) => {
          await stdinReady.wait();
          // await idleWaiter.wait(20); // wait for idle for 200ms to avoid messing up claude's input
          shell.write(data);
        },
      }),
      readable: shellOutputStream.readable,
    })
    .forEach(() => exitIdleWaiter.ping())
    .forEach(() => nextStdout.ready())

    .forkTo(async (e) => {
      if (!rawLogPath) return e.run(); // nil
      console.log('[cli]-yes logging raw output to', rawLogPath);
      return e
        .forEach(async (chars) => {
          // write raw logs ~/.claude-yes/logs-raw/YYYY-MM-DD/HHMMSSmmm-[cli]-yes.log
          //including control characters, for debug
          await writeFile(rawLogPath, chars, { flag: 'a' }).catch(() => null);
        })
        .run();
    })

    // handle cursor position requests and render terminal output
    .forEach((text) => {
      // render terminal output for log file
      terminalRender.write(text);

      // Handle Device Attributes query (DA) - ESC[c or ESC[0c
      // This must be handled regardless of TTY status
      if (text.includes('\u001b[c') || text.includes('\u001b[0c')) {
        // Respond with VT100 with Advanced Video Option
        shell.write('\u001b[?1;2c');
        yesLog`device|respond DA: VT100 with Advanced Video Option`;
        return;
      }

      // todo: .onStatus((msg)=> shell.write(msg))
      if (process.stdin.isTTY) return; // only handle it when stdin is not tty

      if (!text.includes('\u001b[6n')) return; // only asked for cursor position
      // todo: use terminalRender API to get cursor position when new version is available
      // xterm replies CSI row; column R if asked cursor position
      // https://en.wikipedia.org/wiki/ANSI_escape_code#:~:text=citation%20needed%5D-,xterm%20replies,-CSI%20row%C2%A0%3B
      // when agent asking position, respond with row; col
      // const rendered = terminalRender.render();
      const { col, row } = terminalRender.getCursorPosition();
      shell.write(`\u001b[${row};${col}R`); // reply cli when getting cursor position
      yesLog`cursor|respond position: row=${String(row)}, col=${String(col)}`;
      // const row = rendered.split('\n').length + 1;
      // const col = (rendered.split('\n').slice(-1)[0]?.length || 0) + 1;
    })

    // auto-response
    .forkTo((e) =>
      e
        .map((e) => removeControlCharacters(e))
        .map((e) => e.replaceAll('\r', '')) // remove carriage return
        .by((s) => {
          if (conf.noEOL) return s; // codex use cursor-move csi code insteadof \n to move lines, so the output have no \n at all, this hack prevents stuck on unended line
          return s.lines({ EOL: 'NONE' }); // other clis use ink, which is rerendering the block based on \n lines
        })
        .forEach((e) => yesLog`output|${e}`) // for debugging
        // Generic auto-response handler driven by CLI_CONFIGURES
        .forEach(async (e, i) => {
          // ready matcher: if matched, mark stdin ready
          if (conf.ready?.some((rx: RegExp) => e.match(rx))) {
            await yesLog`ready |${e}`;
            if (cli === 'gemini' && i <= 80) return; // gemini initial noise, only after many lines
            stdinReady.ready();
          }

          // enter matchers: send Enter when any enter regex matches
          if (conf.enter?.some((rx: RegExp) => e.match(rx))) {
            await yesLog`enter |${e}`;
            await sendEnter(300); // send Enter after 300ms idle wait
            return;
          }

          // fatal matchers: set isFatal flag when matched
          if (conf.fatal?.some((rx: RegExp) => e.match(rx))) {
            await yesLog`fatal |${e}`;
            isFatal = true;
            await exitAgent();
          }

          // session ID capture for codex
          if (cli === 'codex') {
            const sessionId = extractSessionId(e);
            if (sessionId) {
              await yesLog`session|captured session ID: ${sessionId}`;
              await storeSessionForCwd(workingDir, sessionId);
            }
          }
        })
        .run(),
    )
    .map((e) =>
      removeControlCharactersFromStdout ? removeControlCharacters(e) : e,
    )
    .to(fromWritable(process.stdout))
    .then(() => null); // run it immediately without await

  // wait for cli ready and send prompt if provided
  if (cli === 'codex') shell.write(`\u001b[1;1R`); // send cursor position response when stdin is not tty
  if (prompt) await sendMessage(prompt);

  const exitCode = await pendingExitCode.promise; // wait for the shell to exit
  console.log(`[${cli}-yes] ${cli} exited with code ${exitCode}`);

  // Update task status and release lock
  if (queue && shouldUseLock(workingDir)) {
    await updateCurrentTaskStatus(
      exitCode === 0 ? 'completed' : 'failed',
    ).catch(() => null);
    await releaseLock().catch(() => null);
  }

  if (logPath) {
    await writeFile(logPath, terminalRender.render()).catch(() => null);
    console.log(`[${cli}-yes] Full logs saved to ${logPath}`);
  }

  // deprecated logFile option, we have logPath now, but keep for backward compatibility
  if (logFile) {
    verbose && console.log(`[${cli}-yes] Writing rendered logs to ${logFile}`);
    const logFilePath = path.resolve(logFile);
    await mkdir(path.dirname(logFilePath), { recursive: true }).catch(
      () => null,
    );
    await writeFile(logFilePath, terminalRender.render());
  }

  return { exitCode, logs: terminalRender.render() };

  async function sendEnter(waitms = 1000) {
    // wait for idle for a bit to let agent cli finish rendering
    const st = Date.now();
    await exitIdleWaiter.wait(waitms);
    const et = Date.now();
    // process.stdout.write(`\ridleWaiter.wait(${waitms}) took ${et - st}ms\r`);
    await yesLog`sendEn| idleWaiter.wait(${String(waitms)}) took ${String(et - st)}ms`;
    nextStdout.unready();
    shell.write('\r');
    // retry once if not received any output in 1 second after sending Enter
    await Promise.race([
      nextStdout.wait(),
      new Promise<void>((resolve) =>
        setTimeout(() => {
          if (!nextStdout.ready) {
            shell.write('\r');
          }
          resolve();
        }, 1000),
      ),
    ]);
  }

  async function sendMessage(message: string) {
    await stdinReady.wait();
    // show in-place message: write msg and move cursor back start
    yesLog`send  |${message}`;
    nextStdout.unready();
    shell.write(message);
    exitIdleWaiter.ping(); // just sent a message, wait for echo
    yesLog`waiting next stdout|${message}`;
    await nextStdout.wait();
    yesLog`sending enter`;
    await sendEnter(1000);
    yesLog`sent enter`;
  }

  async function exitAgent() {
    robust = false; // disable robust to avoid auto restart

    // send exit command to the shell, must sleep a bit to avoid claude treat it as pasted input
    for (const cmd of cliConf.exitCommands ?? ['/exit']) await sendMessage(cmd);

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

  function getTerminalDimensions() {
    if (!process.stdout.isTTY) return { cols: 80, rows: 30 }; // default size when not tty
    return {
      // TODO: enforce minimum cols/rows to avoid layout issues
      // cols: Math.max(process.stdout.columns, 80),
      cols: Math.min(Math.max(20, process.stdout.columns), 80),
      rows: process.stdout.rows,
    };
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
