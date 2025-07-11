import { execaCommand } from 'execa';
import { fromStdio } from "from-node-stream";
import { exec } from "node:child_process";
import { existsSync } from 'node:fs';
import { readFile, unlink } from 'node:fs/promises';
import sflow from "sflow";
import { beforeAll, describe, expect, it } from "vitest";
import { createIdleWatcher } from "./createIdleWatcher";
import { sleepms } from './utils';

beforeAll(async () => {
    await execaCommand(`bun run build`)
        .then(() => console.log('Build successful')
        )
})

describe('CLI Tests', () => {
    it('Write file with auto bypass permission prompt', async () => {
        const flagFile = './.cache/flag.json';
        // clean
        await unlink(flagFile).catch(() => { });

        const p = exec(`node dist/cli.js "just write {on: 1} into ./.cache/flag.json"`);
        const tr = new TransformStream<string, string>()
        const w = tr.writable.getWriter();

        const exit = async () => await sflow(['\r', '/exit', '\r', '\r']).forEach(async (e) => {
            await sleepms(200)
            await w.write(e)
        }).run();

        // ping function to exit claude when idle

        const { ping } = createIdleWatcher(() => exit(), 3000);

        const output = (await sflow(tr.readable).by(fromStdio(p)).log()
            .forEach(() => ping())
            .text())

        // expect the file exists
        expect(existsSync(flagFile)).toBe(true);
        // expect the output contains the file path
        expect(output).toContain(flagFile);
        
        // expect the file content to be 'on'
        expect(await new Response(await readFile(flagFile)).json()).toEqual({ on: 1 });

        expect(p.exitCode).toBe(0); // expect the process to exit successfully

        // 30 seconds timeout for this test, it usually takes 13s to run (10s for claude to solve this problem, 3s for idle watcher to exit)
    }, 30e3);

    it('CLI --exit-on-idle flag with default timeout', async () => {
        const p = exec(`node dist/cli.js "echo hello" --exit-on-idle`);
        const tr = new TransformStream<string, string>()
        const output = (await sflow(tr.readable).by(fromStdio(p)).log().text())
        expect(output).toContain('hello');
        await sleepms(1000); // wait for process exit
        expect(p.exitCode).toBe(0);
    }, 30e3);
    
    it('CLI --exit-on-idle flag with custom timeout', async () => {
        const p = exec(`node dist/cli.js --exit-on-idle=1s "echo hello"`);
        const tr = new TransformStream<string, string>()
        const output = (await sflow(tr.readable).by(fromStdio(p)).log().text())
        expect(output).toContain('hello');
        await sleepms(1000); // wait for process exit
        expect(p.exitCode).toBe(0);
    }, 30e3);
})

