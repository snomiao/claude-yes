#! /usr/bin/env bun
import { execaCommand } from 'execa';
import { copyFile } from 'fs/promises';
import { CLI_CONFIGURES } from '.';
import * as pkg from './package.json';

const src = 'dist/cli.js';
await Promise.all(
  Object.keys(CLI_CONFIGURES).map(async (cli) => {
    const dst = `dist/${cli}-yes.js`;
    if (!pkg.bin?.[cli as keyof typeof pkg.bin])
      await execaCommand(`npm pkg set bin.${cli}-yes=${dst}`);
    await copyFile(src, dst);
  }),
);
