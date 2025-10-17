import { exec } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, unlink } from 'node:fs/promises';
import { fromStdio } from 'from-node-stream';
import sflow from 'sflow';
import { expect, it } from 'vitest';
import { IdleWaiter } from './idleWaiter';
import { sleepms } from './utils';

it.skip('Write file with auto bypass prompts', async () => {
  const flagFile = './.cache/flag.json';
  await cleanup();
  async function cleanup() {
    await unlink(flagFile).catch(() => {});
    await unlink('./cli-rendered.log').catch(() => {});
  }

  const p = exec(
    `bunx tsx ./ts/cli.ts claude --logFile=./cli-rendered.log --idle=3s -- "just write {on: 1} into ./.cache/flag.json and wait"`,
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

  const idleWaiter = new IdleWaiter();
  idleWaiter.wait(3000).then(() => exit());

  const output = await sflow(tr.readable)
    .by(fromStdio(p))
    .log()
    .forEach(() => idleWaiter.ping())
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
