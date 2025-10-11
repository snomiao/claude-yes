#! /usr/bin/env bun
import { execaCommand } from 'execa';
import { copyFile } from 'fs/promises';
import * as pkg from '../package.json';
import { CLI_CONFIG } from './config';

const src = 'dist/cli.js';
await Promise.all(
  Object.keys(CLI_CONFIG).map(async (cli) => {
    const dst = `dist/${cli}-yes.js`;
    if (!(pkg.bin as Record<string, string>)?.[`${cli}-yes`]) {
      console.log(`package.json Updated bin.${cli}-yes = ${dst}`);
      await execaCommand(`npm pkg set bin.${cli}-yes=${dst}`);
    }
    await copyFile(src, dst);
    console.log(`${dst} Updated`);
  }),
);
