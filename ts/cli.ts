#!/usr/bin/env node
import DIE from 'phpdie';
import cliYesConfig from '../cli-yes.config';

// if node-pty is not installed, re-run with bun
const hasNodePty = !!(await import('node-pty').catch(() => null));
if (!globalThis.Bun && !hasNodePty) {
  // run with same arguments in Bun if not already
  console.log('No node-pty installed. Re-running with Bun...', process.argv);
  (await import('child_process')).spawnSync(
    'node_modules/.bin/bun',
    [process.argv[1]!, '--', ...process.argv.slice(2)],
    { stdio: 'inherit' },
  );
  process.exit(0);
}
// check and fix bun-pty on some systems
if (globalThis.Bun) console.log('Bun detected, using bun-pty');
//   await import("./fix-pty.js")

// console.log('Running', process.argv);

// Import the CLI module
const { default: cliYes, parseCliArgs } = await import('./');

// Parse CLI arguments
const config = parseCliArgs(process.argv);

// Validate CLI name
if (!config.cli)
  DIE`missing cli def, available clis: ${Object.keys((await cliYesConfig).clis).join(', ')}`;

if (config.verbose) {
  process.env.VERBOSE = 'true'; // enable verbose logging in yesLog.ts
  console.log(config);
}

const { exitCode } = await cliYes(config);

process.exit(exitCode ?? 1);
