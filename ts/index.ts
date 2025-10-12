import { fromReadable, fromWritable } from 'from-node-stream';
import { appendFile, mkdir, rm, writeFile } from 'fs/promises';
import path from 'path';
import DIE from 'phpdie';
import sflow from 'sflow';
import { TerminalTextRender } from 'terminal-render';
import tsaComposer from 'tsa-composer';
import rawConfig from '../cli-yes.config.js';
import { defineCliYesConfig } from './defineConfig.js';
import { IdleWaiter } from './idleWaiter';
import { ReadyManager } from './ReadyManager';
import { removeControlCharacters } from './removeControlCharacters';
import {
  acquireLock,
  releaseLock,
  shouldUseLock,
  updateCurrentTaskStatus,
} from './runningLock';
import { catcher } from './tryCatch';
import { deepMixin } from './utils';
import { yesLog } from './yesLog';

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
};
export type CliYesConfig = {
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
 *   logFile: 'claude.log', // save logs to file
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
  queue = true,
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
  const conf = CLIS_CONFIG[cli] || DIE(`Unsupported cli tool: ${cli}`);

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
  const nextStdout = new ReadyManager();

  const shellOutputStream = new TransformStream<string, string>();
  const outputWriter = shellOutputStream.writable.getWriter();
  // const pty = await import('node-pty');

  // its recommened to use bun-pty in windows
  const pty = await import('node-pty')
    .catch(async () => await import('bun-pty'))
    .catch(async () =>
      DIE('Please install node-pty or bun-pty, run this: bun install bun-pty'),
    );

  const getPtyOptions = () => ({
    name: 'xterm-color',
    ...getTerminalDimensions(),
    cwd: cwd ?? process.cwd(),
    env: env ?? (process.env as Record<string, string>),
  });

  // Apply CLI specific configurations (moved to CLI_CONFIGURES)
  const cliConf = (CLIS_CONFIG as Record<string, AgentCliConfig>)[cli] || {};
  cliArgs = cliConf.defaultArgs
    ? [...cliConf.defaultArgs, ...cliArgs]
    : cliArgs;
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
  const cliCommand = cliConf?.binary || cli;

  let shell = catcher(
    (error: unknown) => {
      console.error(`Fatal: Failed to start ${cliCommand}.`);
      if (cliConf?.install && isCommandNotFoundError(error))
        console.error(
          `If you did not installed it yet, Please install it first: ${cliConf.install}`,
        );
      throw error;

      function isCommandNotFoundError(e: unknown) {
        if (e instanceof Error) {
          return (
            e.message.includes('command not found') ||
            e.message.includes('ENOENT') ||
            e.message.includes('spawn') // windows
          );
        }
        return false;
      }
    },
    () => pty.spawn(cliCommand, cliArgs, getPtyOptions()),
  )();
  const pendingExitCode = Promise.withResolvers<number | null>();
  let pendingExitCodeValue = null;

  // TODO handle error if claude is not installed, show msg:
  // npm install -g @anthropic-ai/claude-code

  async function onData(data: string) {
    // append data to the buffer, so we can process it later
    await outputWriter.write(data);
  }

  shell.onData(onData);
  shell.onExit(function onExit({ exitCode }) {
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

      shell = pty.spawn(cli, conf.restoreArgs, getPtyOptions());
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

  const idleWaiter = new IdleWaiter();
  if (exitOnIdle)
    idleWaiter.wait(exitOnIdle).then(async () => {
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
    .forEach(() => idleWaiter.ping())
    .forEach(() => nextStdout.ready())
    .forEach(async (text) => {
      terminalRender.write(text);
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
      await yesLog`cursor|respond position: row=${String(row)}, col=${String(col)}`;
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
    await idleWaiter.wait(waitms);
    const et = Date.now();
    // process.stdout.write(`\ridleWaiter.wait(${waitms}) took ${et - st}ms\r`);
    await yesLog`sendEn| idleWaiter.wait(${String(waitms)}) took ${String(et - st)}ms`;
    shell.write('\r');
  }

  async function sendMessage(message: string) {
    await stdinReady.wait();
    // show in-place message: write msg and move cursor back start
    yesLog`send  |${message}`;
    nextStdout.unready();
    shell.write(message);
    idleWaiter.ping(); // just sent a message, wait for echo
    yesLog`waiting next stdout|${message}`;
    await nextStdout.wait();
    yesLog`sending enter`;
    await sendEnter(1000);
    yesLog`sent enter`;
  }

  async function exitAgent() {
    robust = false; // disable robust to avoid auto restart

    // send exit command to the shell, must sleep a bit to avoid claude treat it as pasted input
    await sendMessage('/exit');

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

export { removeControlCharacters };
