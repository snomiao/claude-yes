#!/usr/bin/env node
import DIE from 'phpdie';
import cliYes, { SUPPORTED_CLIS } from '.';
import { parseCliArgs } from './parseCliArgs';

// Parse CLI arguments
const config = parseCliArgs(process.argv);

// Validate CLI name
if (!config.cli) {
  DIE('missing cli def');
}

// console.clear();
if (config.verbose) {
  process.env.VERBOSE = 'true'; // enable verbose logging in yesLog.ts
  console.log(config);
}

const { exitCode } = await cliYes(config);

process.exit(exitCode ?? 1);
