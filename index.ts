
import { fromReadable, fromWritable } from "from-node-stream";
import * as pty from "node-pty";
import sflow from "sflow";
import { createIdleWatcher } from "./createIdleWatcher";
import { removeControlCharacters } from "./removeControlCharacters";
import { sleepms } from "./utils";


if (import.meta.main) await main();
async function main() {
    // this script not support bun yet, so use node js to run.

    // node-pty is not supported in bun, so we use node.js to run this script
}

export default async function yesClaude({ continueOnCrash, exitOnIdle, claudeArgs = [] }: { continueOnCrash?: boolean, exitOnIdle?: boolean | number, claudeArgs?: string[] } = {}) {
    const defaultTimeout = 5e3; // 5 seconds idle timeout
    const idleTimeout = typeof exitOnIdle === 'number' ? exitOnIdle : defaultTimeout;

    console.log('⭐ Starting claude, automatically responding to yes/no prompts...');
    console.log('⚠️ Important Security Warning: Only run this on trusted repositories. This tool automatically responds to prompts and can execute commands without user confirmation. Be aware of potential prompt injection attacks where malicious code or instructions could be embedded in files or user inputs to manipulate the automated responses.');

    process.stdin.setRawMode?.(true) //must be called any stdout/stdin usage
    const prefix = '' // "YESC|"
    const PREFIXLENGTH = prefix.length;


    // TODO: implement this flag to continue on crash
    // 1. if it crashes, show message 'claude crashed, restarting..'
    // 2. spawn a 'claude --continue'
    // 3. when new process it's ready, re-attach the into new process (in shellStdio, pipe new process stdin/stdout to )
    // 4. if it crashes again, exit the process

    const shellOutputStream = new TransformStream<string, string>()
    const outputWriter = shellOutputStream.writable.getWriter()

    let shell = pty.spawn('claude', claudeArgs, {
        cols: process.stdout.columns - PREFIXLENGTH,
        rows: process.stdout.rows,
        cwd: process.cwd(),
        env: process.env,
    });
    // TODO handle error if claude is not installed, show msg:
    // npm install -g @anthropic-ai/claude-code

    async function onData(data: string) {
        // append data to the buffer, so we can process it later
        await outputWriter.write(data);
    }
    shell.onData(onData)
    // when claude process exits, exit the main process with the same exit code
    shell.onExit(function onExit({ exitCode }) {
        if (continueOnCrash) {
            if (exitCode !== 0) {
                console.log('Claude crashed, restarting...');
                shell = pty.spawn('claude', ['continue', '--continue'], {
                    cols: process.stdout.columns - PREFIXLENGTH,
                    rows: process.stdout.rows,
                    cwd: process.cwd(),
                    env: process.env,
                });
                shell.onData(onData)
                shell.onExit(onExit);
            }
        }
        void process.exit(exitCode);
    });

    const exitClaudeCode = async () => {
        // send exit command to the shell, must sleep a bit to avoid claude treat it as pasted input
        await sflow(['\r', '/exit', '\r']).forEach(async (e) => {
            await sleepms(200)
            shell.write(e)
        }).run();

        // wait for shell to exit or kill it with a timeout
        let exited = false;
        await Promise.race([
            new Promise<void>((resolve) => shell.onExit(() => { resolve(); exited = true; })), // resolve when shell exits
            // if shell doesn't exit in 5 seconds, kill it
            new Promise<void>((resolve) => setTimeout(() => {
                if (exited) return; // if shell already exited, do nothing
                shell.kill(); // kill the shell process if it doesn't exit in time
                resolve();
            }, 5000)) // 5 seconds timeout
        ]);
    }

    // when current tty resized, resize the pty
    process.stdout.on('resize', () => {
        const { columns, rows } = process.stdout;
        shell.resize(columns - PREFIXLENGTH, rows);
    });

    const shellStdio = {
        writable: new WritableStream<string>({ write: (data) => shell.write(data), close: () => { } }),
        readable: shellOutputStream.readable
    };

    const idleWatcher = createIdleWatcher(async () => {
        if (exitOnIdle) {
            console.log('Claude is idle, exiting...');
            await exitClaudeCode()
        }
    }, idleTimeout);

    await sflow(fromReadable<Buffer>(process.stdin))
        .map((buffer) => buffer.toString())
        // .forEach(e => appendFile('.cache/io.log', "input |" + JSON.stringify(e) + '\n')) // for debugging
        .by(shellStdio)
        .forkTo(e => e
            .map(e => removeControlCharacters(e as string))
            .map(e => e.replaceAll('\r', '')) // remove carriage return
            .forEach(async e => {
                if (e.match(/❯ 1. Yes/)) {
                    await sleepms(200)
                    shell.write("\r")
                }
            })
            .forEach(async e => {
                if (e.match(/❯ 1. Dark mode✔|Press Enter to continue…/)) {
                    await sleepms(200)
                    shell.write("\r")
                }
            })
            // .forEach(e => appendFile('.cache/io.log', "output|" + JSON.stringify(e) + '\n')) // for debugging
            .run()
        )
        .replaceAll(/.*(?:\r\n?|\r?\n)/g, (line) => prefix + line) // add prefix
        .forEach(() => idleWatcher.ping()) // ping the idle watcher on output for last active time to keep track of claude status
        .map(e => !process.stdout.isTTY ? removeControlCharacters(e) : (e)) // remove control characters if output is not a TTY
        .to(fromWritable(process.stdout));
}

export { removeControlCharacters };
