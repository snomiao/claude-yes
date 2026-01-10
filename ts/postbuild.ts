#! /usr/bin/env bun
import { execaCommand } from "execa";
import { copyFile } from "fs/promises";
import * as pkg from "../package.json";
import { CLIS_CONFIG } from "./index.ts";

const src = "dist/cli.js";
await Promise.all(
  Object.keys(CLIS_CONFIG).map(async (cli) => {
    const dst = `dist/${cli}-yes.js`;
    if (!(pkg.bin as Record<string, string>)?.[`${cli}-yes`]) {
      console.log(`package.json Updated bin.${cli}-yes = ${dst}`);
      await execaCommand(`npm pkg set bin.${cli}-yes=${dst}`);
    }
    await copyFile(src, dst);
    console.log(`${dst} Updated`);
  }),
);
