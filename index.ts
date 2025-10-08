import { fromReadable, fromWritable } from 'from-node-stream';
import { appendFile, mkdir, rm, writeFile } from 'fs/promises';
import path from 'path';
import DIE from 'phpdie';
import sflow from 'sflow';
import { TerminalTextRender } from 'terminal-render';
import tsaComposer from 'tsa-composer';
import { IdleWaiter } from './idleWaiter';
import { ReadyManager } from './ReadyManager';
import { removeControlCharacters } from './removeControlCharacters';

export const CLI_CONFIGURES: Record<
  string,
  {
    install?: string; // hint user for install command if not installed
    binary?: string; // actual binary name if different from cli
    ready?: RegExp[]; // regex matcher for stdin ready, or line index for gemini
    enter?: RegExp[]; // array of regex to match for sending Enter
    fatal?: RegExp[]; // array of regex to match for fatal errors
    ensureArgs?: (args: string[]) => string[]; // function to ensure certain args are present
  }
> = {
  grok: {
    install: 'npm install -g @vibe-kit/grok-cli',
    ready: [/^  │ ❯ /],
    enter: [/^   1. Yes/],
  },
  claude: {
    install: 'npm install -g @anthropic-ai/claude-code',
    // ready: [/^> /], // regex matcher for stdin ready
    ready: [/\? for shortcuts/], // regex matcher for stdin ready
    enter: [/❯ 1. Yes/, /❯ 1. Dark mode✔/, /Press Enter to continue…/],
    fatal: [
      /No conversation found to continue/,
      /⎿  Claude usage limit reached\./,
    ],
  },
  gemini: {
    install: 'npm install -g @google/gemini-cli',
    // match the agent prompt after initial lines; handled by index logic using line index
    ready: [/Type your message/], // used with line index check
    enter: [/│ ● 1. Yes, allow once/],
    fatal: [],
  },
  codex: {
    install: 'npm install -g @openai/codex-cli',
    ready: [/⏎ send/],
    enter: [
      /> 1. Yes, allow Codex to work in this folder/,
      /> 1. Approve and run now/,
    ],
    fatal: [/Error: The cursor position could not be read within/],
    // add to codex --search by default when not provided by the user
    ensureArgs: (args: string[]) => {
      if (!args.includes('--search')) return ['--search', ...args];
      return args;
    },
  },
  copilot: {
    install: 'npm install -g @github/copilot',
    ready: [/^  > /],
    enter: [/ │ ❯ 1. Yes, proceed/, /❯ 1. Yes/],
    fatal: [],
  },
  cursor: {
    install: 'open https://cursor.com/ja/docs/cli/installation',
    // map logical "cursor" cli name to actual binary name
    binary: 'cursor-agent',
    ready: [/\/ commands/],
    enter: [/→ Run \(once\) \(y\) \(enter\)/, /▶ \[a\] Trust this workspace/],
    fatal: [/^  Error: You've hit your usage limit/],
  },
};
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
 *
 * @example
 * ```typescript
 * import claudeYes from 'claude-yes';
 * await claudeYes({
 *   prompt: 'help me solve all todos in my codebase',
 *
 *   // optional
 *   cli: 'claude',
 *   cliArgs: ['--verbose'], // additional args to pass to claude
 *   exitOnIdle: 30000, // exit after 30 seconds of idle
 *   continueOnCrash: true, // restart if claude crashes, default is true
 *   logFile: 'claude.log', // save logs to file
 * });
 * ```
 */
export default async function claudeYes({
  cli = 'claude',
  cliArgs = [],
  prompt,
  continueOnCrash,
  cwd,
  env,
  exitOnIdle,
  logFile,
  removeControlCharactersFromStdout = false, // = !process.stdout.isTTY,
  verbose = false,
}: {
  cli?: (string & {}) | keyof typeof CLI_CONFIGURES;
  cliArgs?: string[];
  prompt?: string;
  continueOnCrash?: boolean;
  cwd?: string;
  env?: Record<string, string>;
  exitOnIdle?: number;
  logFile?: string;
  removeControlCharactersFromStdout?: boolean;
  verbose?: boolean;
} = {}) {
  await rm('agent-yes.log').catch(() => null); // ignore error if file doesn't exist
  const yesLog = tsaComposer()(async function yesLog(msg: string) {
    await appendFile('agent-yes.log', `${msg}\n`).catch(() => null);
  });
  const continueArgs = {
    codex: 'resume --last'.split(' '),
    claude: '--continue'.split(' '),
    gemini: [], // not possible yet
  };

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
  const cliConf = (CLI_CONFIGURES as Record<string, any>)[cli] || {};
  cliArgs = cliConf.ensureArgs?.(cliArgs) ?? cliArgs;
  const cliCommand = cliConf?.binary || cli;

  let shell = tryCatch(
    () => pty.spawn(cliCommand, cliArgs, getPtyOptions()),
    (error: unknown) => {
      console.error(`Fatal: Failed to start ${cliCommand}.`);
      if (cliConf?.install)
        console.error(
          `If you did not installed it yet, Please install it first: ${cliConf.install}`,
        );
      throw error;
    },
  );
  const pendingExitCode = Promise.withResolvers<number | null>();
  let pendingExitCodeValue = null;

  // TODO handle error if claude is not installed, show msg:
  // npm install -g @anthropic-ai/claude-code

  async function onData(data: string) {
    nextStdout.ready();
    // append data to the buffer, so we can process it later
    await outputWriter.write(data);
  }

  shell.onData(onData);
  shell.onExit(function onExit({ exitCode }) {
    nextStdout.ready();
    stdinReady.unready(); // start buffer stdin
    const agentCrashed = exitCode !== 0;
    const continueArg = (continueArgs as Record<string, string[]>)[cli];

    if (agentCrashed && continueOnCrash && continueArg) {
      if (!continueArg) {
        return console.warn(
          `continueOnCrash is only supported for ${Object.keys(continueArgs).join(', ')} currently, not ${cli}`,
        );
      }
      if (isFatal) {
        return pendingExitCode.resolve((pendingExitCodeValue = exitCode));
      }

      console.log(`${cli} crashed, restarting...`);

      shell = pty.spawn(cli, continueArg, getPtyOptions());
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
    .forEach((text) => {
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
      console.log(
        `[${cli}-yes] Responding cursor position: row=${row}, col=${col}`,
      );
      shell.write(`\u001b[${row};${col}R`); // reply cli when getting cursor position
      // const row = rendered.split('\n').length + 1;
      // const col = (rendered.split('\n').slice(-1)[0]?.length || 0) + 1;
    })

    // auto-response
    .forkTo((e) =>
      e
        .map((e) => removeControlCharacters(e))
        .map((e) => e.replaceAll('\r', '')) // remove carriage return
        .by((s) => {
          if (cli === 'codex') return s; // codex use cursor-move csi code insteadof \n to move lines, so the output have no \n at all, this hack prevents stuck on unended line
          return s.lines({ EOL: 'NONE' }); // other clis use ink, which is rerendering the block based on \n lines
        })
        .forEach((e) => yesLog`output|${e}`) // for debugging
        // Generic auto-response handler driven by CLI_CONFIGURES
        .forEach(async (e, i) => {
          const conf =
            CLI_CONFIGURES[cli as keyof typeof CLI_CONFIGURES] || null;
          if (!conf) return;

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
    await yesLog`send  |${message}`;
    shell.write(message);
    nextStdout.unready();
    idleWaiter.ping(); // just sent a message, wait for echo
    await nextStdout.wait();
    await sendEnter();
  }

  async function exitAgent() {
    continueOnCrash = false;
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

function tryCatch<T, R>(fn: () => T, catchFn: (error: unknown) => R): T | R {
  try {
    return fn();
  } catch (error) {
    return catchFn(error);
  }
}
