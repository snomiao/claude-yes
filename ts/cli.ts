#!/usr/bin/env node
import DIE from 'phpdie';
import { argv } from 'process';
import cliYesConfig from '../agent-yes.config';

// Import the CLI module
const { default: cliYes, parseCliArgs } = await import('./');

// Parse CLI arguments
const config = parseCliArgs(process.argv);

// Validate CLI name
if (!config.cli)
  DIE`missing cli def, available clis: ${Object.keys((await cliYesConfig).clis).join(', ')}`;

console.log(`Using CLI: ${config.cli}`);

if (config.verbose) {
  process.env.VERBOSE = 'true'; // enable verbose logging in yesLog.ts
  console.log(config);
  console.log(argv);
}

const { exitCode } = await cliYes(config);

process.exit(exitCode ?? 1);
