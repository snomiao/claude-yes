import { fromReadable, fromWritable } from "from-node-stream";
import sflow from "sflow";
import { createIdleWatcher } from "./createIdleWatcher";
import { removeControlCharacters } from "./removeControlCharacters";
import { sleepms } from "./utils";

if (import.meta.main) await main();

async function main() {
  await claudeYes({
    continueOnCrash: true,
    exitOnIdle: 10000,
    claudeArgs: ["say hello and exit"]
  })
}

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
 */
export default async function claudeYes({
  continueOnCrash,
  exitOnIdle,
  claudeArgs = [],
  cwd = process.cwd(),
}: {
  continueOnCrash?: boolean;
  exitOnIdle?: boolean | number;
  claudeArgs?: string[];
  cwd?: string;
} = {}) {
  const defaultTimeout = 5e3; // 5 seconds idle timeout
  const idleTimeout =
    typeof exitOnIdle === "number" ? exitOnIdle : defaultTimeout;

  console.log(
    "⭐ Starting claude, automatically responding to yes/no prompts..."
  );
  console.log(
    "⚠️ Important Security Warning: Only run this on trusted repositories. This tool automatically responds to prompts and can execute commands without user confirmation. Be aware of potential prompt injection attacks where malicious code or instructions could be embedded in files or user inputs to manipulate the automated responses."
  );

  process.stdin.setRawMode?.(true); //must be called any stdout/stdin usage
  const prefix = ""; // "YESC|"
  const PREFIXLENGTH = prefix.length;
  let errorNoConversation = false; // match 'No conversation found to continue'

  const shellOutputStream = new TransformStream<string, string>();
  const outputWriter = shellOutputStream.writable.getWriter();
  const pty = globalThis.Bun
    ? await import('bun-pty')
    : await import('node-pty');
  let shell = pty.spawn("claude", claudeArgs, {
    name: "xterm-color",
    cols: process.stdout.columns - PREFIXLENGTH,
    rows: process.stdout.rows,
    cwd,
    env: process.env as Record<string, string>,
  });
  // TODO handle error if claude is not installed, show msg:
  // npm install -g @anthropic-ai/claude-code

  async function onData(data: string) {
    // append data to the buffer, so we can process it later
    await outputWriter.write(data);
  }
  shell.onData(onData);
  // when claude process exits, exit the main process with the same exit code
  shell.onExit(function onExit({ exitCode }) {
    if (continueOnCrash && exitCode !== 0) {
      if (errorNoConversation) {
        console.log(
          'Claude crashed with "No conversation found to continue", exiting...'
        );
        void process.exit(exitCode);
      }
      console.log("Claude crashed, restarting...");
      shell = pty.spawn("claude", ["continue", "--continue"], {
        name: "xterm-color",
        cols: process.stdout.columns - PREFIXLENGTH,
        rows: process.stdout.rows,
        cwd,
        env: process.env as Record<string, string>,
      });
      shell.onData(onData);
      shell.onExit(onExit);
      return;
    }
    void process.exit(exitCode);
  });

  const exitClaudeCode = async () => {
    // send exit command to the shell, must sleep a bit to avoid claude treat it as pasted input
    await sflow(["\r", "/exit", "\r"])
      .forEach(async (e) => {
        await sleepms(200);
        shell.write(e);
      })
      .run();

    // wait for shell to exit or kill it with a timeout
    let exited = false;
    await Promise.race([
      new Promise<void>((resolve) =>
        shell.onExit(() => {
          resolve();
          exited = true;
        })
      ), // resolve when shell exits
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
  process.stdout.on("resize", () => {
    const { columns, rows } = process.stdout;
    shell.resize(columns - PREFIXLENGTH, rows);
  });

  const shellStdio = {
    writable: new WritableStream<string>({
      write: (data) => shell.write(data),
      close: () => { },
    }),
    readable: shellOutputStream.readable,
  };

  const idleWatcher = createIdleWatcher(async () => {
    if (exitOnIdle) {
      console.log("Claude is idle, exiting...");
      await exitClaudeCode();
    }
  }, idleTimeout);
  const confirm = async () => {
    await sleepms(200);
    shell.write("\r");
  };
  await sflow(fromReadable<Buffer>(process.stdin))
    .map((buffer) => buffer.toString())
    // .forEach(e => appendFile('.cache/io.log', "input |" + JSON.stringify(e) + '\n')) // for debugging
    .by(shellStdio)
    .forkTo((e) =>
      e
        .map((e) => removeControlCharacters(e as string))
        .map((e) => e.replaceAll("\r", "")) // remove carriage return
        .forEach(async (e) => {
          if (e.match(/❯ 1. Yes/)) return await confirm();
          if (e.match(/❯ 1. Dark mode✔|Press Enter to continue…/))
            return await confirm();
          if (e.match(/No conversation found to continue/)) {
            errorNoConversation = true; // set flag to true if error message is found
            return;
          }
        })
        // .forEach(e => appendFile('.cache/io.log', "output|" + JSON.stringify(e) + '\n')) // for debugging
        .run()
    )
    .replaceAll(/.*(?:\r\n?|\r?\n)/g, (line) => prefix + line) // add prefix
    .forEach(() => idleWatcher.ping()) // ping the idle watcher on output for last active time to keep track of claude status
    .map((e) => (!process.stdout.isTTY ? removeControlCharacters(e) : e)) // remove control characters if output is not a TTY
    .to(fromWritable(process.stdout));
}

export { removeControlCharacters };
