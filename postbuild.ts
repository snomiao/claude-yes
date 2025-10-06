#! /usr/bin/env bun
import { copyFile } from 'fs/promises';
import * as pkg from './package.json';

const src = 'dist/cli.js';
await Promise.all(Object.values(pkg.bin).map((dst) => copyFile(src, dst)));
