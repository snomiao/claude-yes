
import esMain from "es-main";
import { fromReadable, fromWritable } from "from-node-stream";
import * as pty from "node-pty";
import sflow from "sflow";
import { createIdleWatcher } from "./createIdleWatcher";
import { removeControlCharacters } from "./removeControlCharacters";

if (esMain(import.meta)) {
    // cli entry point

    const rawArgs = process.argv.slice(2);
    const exitOnIdleFlag = "--exit-on-idle"
    const exitOnIdle = rawArgs.includes(exitOnIdleFlag); // check if --exit-on-idle flag is passed
    const claudeArgs = (rawArgs).filter(e => e !== exitOnIdleFlag); // remove --exit-on-idle flag if exists

    await yesClaude({
        exitOnIdle,
        claudeArgs
    });

}

export default async function yesClaude({ exitOnIdle, claudeArgs = [] }: { exitOnIdle?: boolean, claudeArgs?: string[] } = {}) {
    const idleTimeout = 5e3 // 5 seconds idle timeout

    console.log('⭐ Starting claude, automatically responding to yes/no prompts...');
    console.log('⚠️ Important Security Warning: Only run this on trusted repositories. This tool automatically responds to prompts and can execute commands without user confirmation. Be aware of potential prompt injection attacks where malicious code or instructions could be embedded in files or user inputs to manipulate the automated responses.');

    // if (!process.stdin.isTTY) {
    //     console.error('Error: This script requires a TTY (terminal) input. Please run it in a terminal.');
    //     console.error('If you want to use prompts, try run:')
    //     console.error('  yes-claude "your prompt here"');
    //     return;
    // }

    process.stdin.setRawMode?.(true) //must be called any stdout/stdin usage
    const prefix = '' // "YESC|"
    const PREFIXLENGTH = prefix.length;


    // TODO: implement this flag to continue on crash
    // 1. if it crashes, show message 'claude crashed, restarting..'
    // 2. spawn a 'claude --continue'
    // 3. when new process it's ready, re-attach the into new process (in shellStdio, pipe new process stdin/stdout to )
    // 4. if it crashes again, exit the process

    const continueOnCrashFlag = "--continue-on-crash";

    const shellOutputStream = new TransformStream<string, string>()
    const outputWriter = shellOutputStream.writable.getWriter()

    const shell = pty.spawn('claude', claudeArgs, {
        cols: process.stdout.columns - PREFIXLENGTH,
        rows: process.stdout.rows,
        cwd: process.cwd(),
        env: process.env,
    });

    // when claude process exits, exit the main process with the same exit code
    shell.onExit(({ exitCode }) => {
        void process.exit(exitCode)
    })
    shell.onData(async (data) => {
        // append data to the buffer, so we can process it later
        await outputWriter.write(data);
    })

    const exitShell = async () => {
        // send exit command to the shell, must sleep a bit to avoid claude treat it as pasted input
        await sflow(['\r', '/exit', '\r']).forEach(async (e) => {
            await sleep(100)
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
            await exitShell()
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
                    await sleep(200)
                    shell.write("\r")
                }
            })
            .forEach(async e => {
                if (e.match(/❯ 1. Dark mode✔|Press Enter to continue…/)) {
                    await sleep(200)
                    shell.write("\r")
                }
            })
            // .forEach(e => appendFile('.cache/io.log', "output|" + JSON.stringify(e) + '\n')) // for debugging
            .run()
        )
        .replaceAll(/.*(?:\r\n?|\r?\n)/g, (line) => prefix + line) // add prefix
        .forEach(() => idleWatcher.ping()) // ping the idle watcher on output for last active time to keep track of claude status
        .to(fromWritable(process.stdout));
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}