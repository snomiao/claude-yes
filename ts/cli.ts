#!/usr/bin/env node
import enhancedMs from 'enhanced-ms';
import path from 'path';
import DIE from 'phpdie';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import cliYes, { CLIS_CONFIG, type CliYesConfig, SUPPORTED_CLIS } from '.';

// cli entry point
const cliName = ((e?: string) => {
  // Handle test environment where script is run as cli.ts
  if (e === 'cli' || e === 'cli.ts') return undefined;
  return e;
})(process.argv[1]?.split('/').pop()?.split('-')[0]);

const argv = yargs(hideBin(process.argv))
  .usage('Usage: $0 [cli] [cli-yes args] [agent-cli args] [--] [prompts...]')
  .example(
    '$0 claude --idle=30s -- solve all todos in my codebase, commit one by one',
    'Run Claude with a 30 seconds idle timeout, and the prompt is everything after `--`',
  )
  .option('robust', {
    type: 'boolean',
    default: true,
    description:
      're-spawn Claude with --continue if it crashes, only works for claude yet',
    alias: 'r',
  })
  .option('logFile', {
    type: 'string',
    description: 'Rendered log file to write to.',
  })
  .option('prompt', {
    type: 'string',
    description: 'Prompt to send to Claude (also can be passed after --)',
    alias: 'p',
  })
  .option('verbose', {
    type: 'boolean',
    description: 'Enable verbose logging, will emit ./agent-yes.log',
    default: false,
  })
  .option('exit-on-idle', {
    type: 'string',
    description: 'Exit after a period of inactivity, e.g., "5s" or "1m"',
    deprecated: 'use --exit instead',
    alias: 'e',
  })
  .option('queue', {
    type: 'boolean',
    description:
      'Queue Agent when spawning multiple agents in the same directory/repo, can be disabled with --no-queue',
    default: true,
  })
  .positional('cli', {
    describe: 'The AI CLI to run, e.g., claude, codex, copilot, cursor, gemini',
    type: 'string',
    choices: SUPPORTED_CLIS,
    demandOption: false,
    default: cliName,
  })
  .help()
  .version()
  .parserConfiguration({
    'unknown-options-as-args': true,
    'halt-at-non-option': true,
  })
  .parseSync();

// detect cli name for cli, while package.json have multiple bin link: {"claude-yes": "cli.js", "codex-yes": "cli.js", "gemini-yes": "cli.js"}
const undefinedNotIndex = (e: number) => (0 <= e ? e : undefined);
const rawArgs = process.argv.slice(2);
const cliArgIndex = undefinedNotIndex(rawArgs.indexOf(String(argv._[0])));
const dashIndex = undefinedNotIndex(rawArgs.indexOf('--'));

// Support: everything after a literal `--` is a prompt string. Example:
//   claude-yes --exit-on-idle=30s -- "help me refactor this"
// In that example the prompt will be `help me refactor this` and won't be
// passed as args to the underlying CLI binary.

const cliArgsForSpawn = rawArgs.slice(cliArgIndex ?? 0, dashIndex ?? undefined); // default to all args
const dashPrompt: string | undefined = rawArgs
  .slice((dashIndex ?? cliArgIndex ?? 0) + 1)
  .join(' ');

// console.clear();
if (argv.verbose) {
  process.env.VERBOSE = 'true'; // enable verbose logging in yesLog.ts
  console.log({ ...argv, cliArgsForSpawn, prompt: dashPrompt });
}

const { exitCode } = await cliYes({
  cli: (cliName ||
    argv.cli ||
    argv._[0]?.toString()?.replace?.(/-yes$/, '') ||
    DIE('missing cli def')) as SUPPORTED_CLIS,
  // prefer explicit --prompt / -p; otherwise use the text after `--` if present
  prompt: [argv.prompt, dashPrompt].join(' ').trim() || undefined,
  exitOnIdle: argv.exitOnIdle ? enhancedMs(argv.exitOnIdle) : undefined,
  cliArgs: cliArgsForSpawn,
  robust: argv.robust,
  logFile: argv.logFile,
  verbose: argv.verbose,
  queue: argv.queue,
});

process.exit(exitCode ?? 1);
