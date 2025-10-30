#!/usr/bin/env node
import DIE from 'phpdie';
import cliYes, { parseCliArgs } from './';

// if (!globalThis.Bun) // run with same arguments in Bun

// Parse CLI arguments
const config = parseCliArgs(process.argv);

// Validate CLI name
if (!config.cli) DIE('missing cli def');

if (config.verbose) {
  process.env.VERBOSE = 'true'; // enable verbose logging in yesLog.ts
  console.log(config);
}

const { exitCode } = await cliYes(config);

process.exit(exitCode ?? 1);
