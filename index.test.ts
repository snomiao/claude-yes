import { sleep } from "bun";
import { fromStdio } from "from-node-stream";
import { exec } from "node:child_process";
import sflow from "sflow";
import { createIdleWatcher } from "./createIdleWatcher";

beforeAll(async () => {
    await Bun.$`bun run build`
        .then(() => {
            console.log('Build successful');
        })
})

// Note: build before running these tests
it('Write file with auto bypass permission prompt', async () => {
    // clean
    await Bun.file('./.cache/flag.json').delete().catch(() => { });

    const p = exec(`node dist/index.js "just write {on: 1} into ./.cache/flag.json"`);
    const tr = new TransformStream<string, string>()
    const w = tr.writable.getWriter();

    const exit = async () => await sflow(['\r', '/exit', '\r']).forEach(async (e) => {
        await sleep(100)
        await w.write(e)
    }).run();

    // ping function to exit claude when idle

    const { ping } = createIdleWatcher(() => exit(), 3000);

    const output = (await sflow(tr.readable).by(fromStdio(p)).log()
        .forEach(() => ping())
        .text())

    // expect the file exists
    expect(await Bun.file('./.cache/flag.json').exists()).toBe(true);
    // expect the output contains the file path
    expect(output).toContain('./.cache/flag.json');
    // expect the file content to be 'on'
    expect(await Bun.file('./.cache/flag.json').json()).toEqual({ on: 1 });

    expect(p.exitCode).toBe(0); // expect the process to exit successfully

    // 30 seconds timeout for this test, it usually takes 13s to run (10s for claude to respond, 3s for idle watcher to exit)
}, 30e3);

