import { fromReadable, fromWritable } from 'from-node-stream';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
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
 * @param options.exitOnIdle - Exit when Claude is idle. Boolean or timeout in milliseconds
 * @param options.claudeArgs - Additional arguments to pass to the Claude CLI
 * @param options.removeControlCharactersFromStdout - Remove ANSI control characters from stdout. Defaults to !process.stdout.isTTY
 */
export default async function claudeYes({
  cli = 'claude',
  cliArgs = [],
  prompt,
  continueOnCrash,
  cwd,
  env,
  exitOnIdle = 60e3,
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
  if (verbose) {
    console.log('calling claudeYes: ', {
      continueOnCrash,
      exitOnIdle,
      claudeArgs: cliArgs,
      cwd,
      removeControlCharactersFromStdout,
      logFile,
      verbose,
    });
  }
  console.log(
    `⭐ Starting ${cli}, automatically responding to yes/no prompts...`
  );
  console.log(
    '⚠️ Important Security Warning: Only run this on trusted repositories. This tool automatically responds to prompts and can execute commands without user confirmation. Be aware of potential prompt injection attacks where malicious code or instructions could be embedded in files or user inputs to manipulate the automated responses.'
  );

  process.stdin.setRawMode?.(true); //must be called any stdout/stdin usage
  const prefix = ''; // "YESC|"
  const PREFIXLENGTH = prefix.length;
  let isFatal = false; // match 'No conversation found to continue'
  const stdinReady = new ReadyManager();

  const shellOutputStream = new TransformStream<string, string>();
  const outputWriter = shellOutputStream.writable.getWriter();
  // const pty = await import('node-pty');

  // recommened to use bun pty in windows
  const pty = await import('node-pty')
    .catch(async () => await import('bun-pty'))
    .catch(async () => {
      throw new Error('Please install node-pty or bun-pty');
    });

  const getPtyOptions = () => ({
    name: 'xterm-color',
    cols: process.stdout.columns - PREFIXLENGTH,
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
          `continueOnCrash is only supported for ${Object.keys(continueArgs).join(', ')} currently, not ${cli}`
        );
      }
      if (isFatal) {
        console.log(
          `${cli} crashed with "No conversation found to continue", exiting...`
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

  const exitClaudeCode = async () => {
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
        }, 5000) 
      ), // 5 seconds timeout
    ]);
  };

  // when current tty resized, resize the pty
  process.stdout.on('resize', () => {
    const { columns, rows } = process.stdout;
    shell.resize(columns - PREFIXLENGTH, rows);
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
          '[claude-yes] Claude is idle, but seems still working, not exiting yet'
        );
        return;
      }

      console.log('[claude-yes] Claude is idle, exiting...');
      await exitClaudeCode();
    });

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

    // auto-response
    .forkTo((e) =>
      e
    .forEach((e)=>{
      // response cursor position to codex
      if(cli === 'codex'){
        if(e.includes('\u001b[6n')){
          shell.write('\u001b[1;1R');
        }
      }
    })
        .map((e) => removeControlCharacters(e as string))
        .map((e) => e.replaceAll('\r', '')) // remove carriage return
        .lines({ EOL: 'NONE' })
        .forEach(async (e) => {
          if (cli !== 'claude') return;

          if (e.match(/^> /)) return stdinReady.ready();
          if (e.match(/❯ 1. Yes/)) return await sendEnter();
          if (e.match(/❯ 1. Dark mode✔|Press Enter to continue…/))
            return await sendEnter();
          if (e.match(/No conversation found to continue/)) {
            isFatal = true; // set flag to true if error message is found
            return;
          }
          if (e.match(/⎿  Claude usage limit reached./)) {
            isFatal = true; // set flag to true if error message is found
            return;
          }
          // reached limit, exiting...
        })
        .forEach(async (e, i) => {
          if (cli !== 'gemini') return;
          if (e.match(/ >   Type your message/) && i > 80) {
            // wait until 80 lines to avoid the initial prompt
            return stdinReady.ready();
          }
          if (e.match(/│ ● 1. Yes, allow once/)) return await sendEnter();
        })
        .forEach(async (e) => {
          if (cli !== 'codex') return;
          if (e.match(/Error: The cursor position could not be read within/))
            return (isFatal = true);
          if (e.match(/> 1. Yes, allow Codex to work in this folder/))
            return await sendEnter();
          if (e.match(/⏎ send/)) return stdinReady.ready();
          if (e.match(/"▌ > 1. Approve"/)) return await sendEnter();
        })
        // .forEach(e => appendFile('.cache/io.log', "output|" + JSON.stringify(e) + '\n')) // for debugging
        .run()
    )
    // .replaceAll(/.*(?:
?|?
)/g, (line) => prefix + line) // add prefix // IGNORE
    .map((e) =>
      removeControlCharactersFromStdout ? removeControlCharacters(e) : e
    )
    .to(fromWritable(process.stdout))
    .then(() => null); // run it immediately without await

  // wait for cli ready and send prompt if provided
  if (prompt)
    (async () => {
      // console.log(`[claude-yes] Ready to send prompt to ${cli}: ${prompt}`);
      // idleWaiter.ping();
      // console.log(
      //   'await idleWaiter.wait(1000); // wait a bit for claude to start'
      // );
      // await idleWaiter.wait(1000); // wait a bit for claude to start
      // console.log('await stdinReady.wait();');
      // await stdinReady.wait();
      // console.log(`[claude-yes] Waiting for ${cli} to be ready...`);
      // console.log('await idleWaiter.wait(200);');
      // await idleWaiter.wait(200);
      // console.log(`[claude-yes] Sending prompt to ${cli}: ${prompt}`);
      await sendMessage(prompt);
    })();

  const exitCode = await pendingExitCode.promise; // wait for the shell to exit
  console.log(`[claude-yes] claude exited with code ${exitCode}`);

  if (logFile) {
    verbose && console.log(`[claude-yes] Writing rendered logs to ${logFile}`);
    const logFilePath = path.resolve(logFile);
    await mkdir(path.dirname(logFilePath), { recursive: true }).catch(
      () => null
    );
    await writeFile(logFilePath, terminalRender.render());
  }

  return { exitCode, logs: terminalRender.render() };

  async function sendEnter() {
    // wait for idle for 100ms to let claude finish rendering
    await idleWaiter.wait(100);
    shell.write('\r');
  }
  async function sendMessage(message: string) {
    process.stdout.write(`\rwaiting stdin...\r`);
    await stdinReady.wait();
    // show in-place message: write msg and move cursor back start
    process.stdout.write(`\rmessage sent...\r`);
    shell.write(message);
    process.stdout.write(`\rmessage sent...\r`);
    idleWaiter.ping(); // just sent a message, wait for echo
    await sendEnter();
  }
}

export { removeControlCharacters };

// get cursor position in terminal
function getCursorPos() {
  return new Promise((resolve) => {
    const termcodes = { cursorGetPosition: '\u001b[6n' };
    const readfx = function () {
      const buf = process.stdin.read();
      const str = JSON.stringify(buf); // "\u001b[9;1R"
      const regex = /\ Arx\[(.*)/g;
      const xy = regex.exec(str)[0].replace(/\ Arx\[|R"/g, '').split(';');
      const pos = { rows: xy[0], cols: xy[1] };
      resolve(pos);
    };

    process.stdin.once('readable', readfx);
    process.stdout.write(termcodes.cursorGetPosition);
  });
}