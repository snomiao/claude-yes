import { fromReadable, fromWritable } from 'from-node-stream';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import DIE from 'phpdie';
import sflow from 'sflow';
import { TerminalTextRender } from 'terminal-render';
import { IdleWaiter } from './idleWaiter';
import { ReadyManager } from './ReadyManager';
import { removeControlCharacters } from './removeControlCharacters';
import { sleepms } from './utils';

/**
 * Main function to run Claude with automatic yes/no respojnses
 * @param options Configuration options
 * @param options.continueOnCrash - If true, automatically restart Claude when it crashes:
 *   1. Shows message 'Claude crashed, restarting..'
 *   2. Spawns a new 'claude --continue' process
 *   3. Re-attaches the new process to the shell stdio (pipes new process stdin/stdout)
 *   4. If it crashes with "No conversation found to continue", exits the process
 * @param options.exitOnIdle - Exit when Claude is idle. Boolean or timeout in milliseconds, recommended 5000 - 60000, default is false
 * @param options.claudeArgs - Additional arguments to pass to the Claude CLI
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
  cli?: 'claude' | 'gemini' | 'codex' | string;
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
  const continueArgs = {
    codex: 'resume --last'.split(' '),
    claude: '--continue'.split(' '),
    gemini: [], // not possible yet
  };
  // if (verbose) {
  //   console.log('calling claudeYes: ', {
  //     cli,
  //     continueOnCrash,
  //     exitOnIdle,
  //     cliArgs,
  //     cwd,
  //     removeControlCharactersFromStdout,
  //     logFile,
  //     verbose,
  //   });
  // }
  // console.log(
  //   `⭐ Starting ${cli}, automatically responding to yes/no prompts...`
  // );
  // console.log(
  //   '⚠️ Important Security Warning: Only run this on trusted repositories. This tool automatically responds to prompts and can execute commands without user confirmation. Be aware of potential prompt injection attacks where malicious code or instructions could be embedded in files or user inputs to manipulate the automated responses.'
  // );

  process.stdin.setRawMode?.(true); // must be called any stdout/stdin usage
  let isFatal = false; // match 'No conversation found to continue'
  const stdinReady = new ReadyManager();

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
    cols: process.stdout.columns,
    rows: process.stdout.rows,
    cwd: cwd ?? process.cwd(),
    env: env ?? (process.env as Record<string, string>),
  });

  // add --search to codex if not present
  if (cli === 'codex' && cliArgs.includes('--search') === false)
    cliArgs.unshift('--search');

  let shell = pty.spawn(cli, cliArgs, getPtyOptions());
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
    const continueArg = (continueArgs as Record<string, string[]>)[cli];

    if (agentCrashed && continueOnCrash && continueArg) {
      if (!continueArg) {
        return console.warn(
          `continueOnCrash is only supported for ${Object.keys(continueArgs).join(', ')} currently, not ${cli}`,
        );
      }
      if (isFatal) {
        console.log(
          `${cli} crashed with "No conversation found to continue", exiting...`,
        );
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
    const { columns, rows } = process.stdout;
    shell.resize(columns, rows);
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

  // Message streaming
  sflow(fromReadable<Buffer>(process.stdin))
    .map((buffer) => buffer.toString())
    .map((e) => e.replaceAll('\x1a', '')) // remove ctrl+z from user's input
    // .forEach(e => appendFile('.cache/io.log', "input |" + JSON.stringify(e) + '\n')) // for debugging
    // pipe
    .by({
      writable: new WritableStream<string>({
        write: async (data) => {
          // await stdinReady.wait();
          await idleWaiter.wait(200); // wait for idle for 200ms to avoid messing up claude's input
          shell.write(data);
        },
      }),
      readable: shellOutputStream.readable,
    })
    .forEach(() => idleWaiter.ping())
    .forEach((text) => terminalRender.write(text))
    .forEach((txt) => {
      // xterm replies CSI row; column R if asked cursor position
      // https://en.wikipedia.org/wiki/ANSI_escape_code#:~:text=citation%20needed%5D-,xterm%20replies,-CSI%20row%C2%A0%3B
      if (process.stdin.isTTY) return; // only handle it when stdin is not tty
      if (txt.includes('\u001b[6n')) return; // only asked
      const rendered = terminalRender.render();
      // when asking position, respond with row; col
      const row = rendered.split('\n').length + 1;
      const col = (rendered.split('\n').slice(-1)[0]?.length || 0) + 1;
      //  shell.write(`\u001b[${row};${col}R`);
    })

    // auto-response
    .forkTo((e) =>
      e
        .map((e) => removeControlCharacters(e))
        .map((e) => e.replaceAll('\r', '')) // remove carriage return
        .lines({ EOL: 'NONE' })
        .forEach(async (e) => {
          if (cli !== 'claude') return;

          if (e.match(/^> /)) return stdinReady.ready();
          if (e.match(/❯ 1. Yes/)) return await sendEnter();
          if (e.match(/❯ 1. Dark mode✔|Press Enter to continue…/))
            return await sendEnter();
          if (e.match(/No conversation found to continue/))
            return (isFatal = true); // set flag to true if error message is found;
          if (e.match(/⎿ {2}Claude usage limit reached./))
            return (isFatal = true); // set flag to true if error message is found;
          // reached limit, exiting...
        })
        .forEach(async (e, i) => {
          if (cli !== 'gemini') return;
          if (e.match(/ > {3}Type your message/) && i > 80) {
            // wait until 80 lines to avoid the initial prompt
            return stdinReady.ready();
          }
          if (e.match(/│ ● 1. Yes, allow once/)) return await sendEnter();
        })
        .forEach(async (e) => {
          if (cli !== 'codex') return;
          if (e.match(/ > 1. Approve/)) return await sendEnter();
          if (e.match(/Error: The cursor position could not be read within/))
            return (isFatal = true);
          if (e.match(/> 1. Yes, allow Codex to work in this folder/))
            return await sendEnter();
          if (e.match(/⏎ send/)) return stdinReady.ready();
        })
        // .forEach(e => appendFile('.cache/io.log', "output|" + JSON.stringify(e) + '\n')) // for debugging
        .run(),
    )
    .map((e) =>
      removeControlCharactersFromStdout ? removeControlCharacters(e) : e,
    )
    .to(fromWritable(process.stdout))
    .then(() => null); // run it immediately without await

  // wait for cli ready and send prompt if provided
  if (prompt)
    (async () => {
      // console.log(`[${cli}-yes] Ready to send prompt to ${cli}: ${prompt}`);
      // idleWaiter.ping();
      // console.log(
      //   'await idleWaiter.wait(1000); // wait a bit for claude to start'
      // );
      // await idleWaiter.wait(1000); // wait a bit for claude to start
      // console.log('await stdinReady.wait();');
      // await stdinReady.wait();
      // console.log(`[${cli}-yes] Waiting for ${cli} to be ready...`);
      // console.log('await idleWaiter.wait(200);');
      // await idleWaiter.wait(200);
      // console.log(`[${cli}-yes] Sending prompt to ${cli}: ${prompt}`);
      await sendMessage(prompt);
    })();

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
    process.stdout.write(`\ridleWaiter.wait(${waitms}) took ${et - st}ms\r`);

    shell.write('\r');
  }

  async function sendMessage(message: string) {
    await stdinReady.wait();
    // show in-place message: write msg and move cursor back start
    shell.write(message);
    idleWaiter.ping(); // just sent a message, wait for echo
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
}

export { removeControlCharacters };
