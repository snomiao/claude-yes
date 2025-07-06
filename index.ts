import esMain from "es-main";
import { fromReadable, fromWritable } from "from-node-stream";
import * as pty from "node-pty";
import sflow from "sflow";

if (esMain(import.meta)) main();

export default async function main() {
    console.clear()

    const PREFIXLENGTH = 0
    const shell = pty.spawn('claude', process.argv.slice(2), {
        cols: process.stdout.columns - PREFIXLENGTH,
        rows: process.stdout.rows,
        cwd: process.cwd(),
        env: process.env,
    });

    // when current tty resized, resize the pty
    process.stdout.on('resize', () => {
        const { columns, rows } = process.stdout;
        shell.resize(columns - PREFIXLENGTH, rows);
    });

    process.stdin.setRawMode(true)
    await sflow(fromReadable<Buffer>(process.stdin))
        .map((e) => e.toString())
        .by({
            writable: new WritableStream<string>({ write: (data) => shell.write(data) }),
            readable: new ReadableStream<string>({
                start: (controller) => shell.onData((data) => controller.enqueue(data)
                )
            })
        })
        .forkTo(e => e
            .map(e => removeControlCharacters(e as string))
            .map(e => e.replaceAll('\r', '')) // remove carriage return
            .forEach(async e => {
                if (e.match(/❯ 1. Yes, proceed/)) {
                    await sleep(100)
                    shell.write("\r")
                }
            })
            .forEach(async e => {
                if (e.match(/❯ 1. Yes/)) {
                    await sleep(100)
                    shell.write("\r")
                }
            })
            .run()
        )
        .to(fromWritable(process.stdout));

}

function removeControlCharacters(str: string): string {
    // Matches control characters in the C0 and C1 ranges, including Delete (U+007F)
    return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
} 