import { execaCommand } from 'execa';
import { fromStdio } from 'from-node-stream';
import { exec } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, unlink } from 'node:fs/promises';
import sflow from 'sflow';
import { beforeAll, describe, expect, it } from 'vitest';
import { createIdleWatcher } from './createIdleWatcher';
import { sleepms } from './utils';

it('Write file with auto bypass prompts', async () => {
  const flagFile = './.cache/flag.json';
  await cleanup();
  async function cleanup() {
    await unlink(flagFile).catch(() => {});
    await unlink('./cli-rendered.log').catch(() => {});
  }

  const p = exec(
    `bunx tsx ./cli.ts --logFile=./cli-rendered.log --exit-on-idle=3s "just write {on: 1} into ./.cache/flag.json and wait"`
  );
  const pExitCode = new Promise<number | null>((r) => p.once('exit', r));

  const tr = new TransformStream<string, string>();
  const w = tr.writable.getWriter();

  const exit = async () =>
    await sflow(['\r', '/exit', '\r', '\r'])
      .forEach(async (e) => {
        await sleepms(200);
        await w.write(e);
      })
      .run();

  // ping function to exit claude when idle

  const { ping } = createIdleWatcher(() => exit(), 3000);

  const output = await sflow(tr.readable)
    .by(fromStdio(p))
    .log()
    .forEach(() => ping())
    .text();

  // expect the file exists
  expect(existsSync(flagFile)).toBe(true);
  // expect the output contains the file path
  expect(output).toContain(flagFile);

  // expect the file content to be 'on'
  expect(await new Response(await readFile(flagFile)).json()).toEqual({
    on: 1,
  });

  expect(await pExitCode).toBe(0); // expect the process to exit successfully
  expect(await readFile('./cli-rendered.log', 'utf8')).toBeTruthy();

  // clean
  await cleanup();

  // it usually takes 13s to run (10s for claude to solve this problem, 3s for idle watcher to exit)
}, 30e3);
