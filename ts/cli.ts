#!/usr/bin/env node
import enhancedMs from 'enhanced-ms';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import cliYes, { SUPPORTED_CLIS } from '.';
import { CLI_CONFIG } from './config';

// cli entry point
const cliName = ((e?: string) => (e === 'cli' ? undefined : e))(
  process.argv[1]?.split('/').pop()?.split('-')[0],
);

const argv = yargs(hideBin(process.argv))
  .usage('Usage: $0 [cli] [options] [agent-cli args] [--] [prompts...]')
  .example(
    '$0 claude --idle=30s -- solve all todos in my codebase, commit one by one',
    'Run Claude with a 30 seconds idle timeout, and the prompt is everything after `--`',
  )
  // .option('continue-on-crash', {
  //   type: 'boolean',
  //   default: true,
  //   description:
  //     'spawn Claude with --continue if it crashes, only works for claude',
  //   alias: 'c',
  // })
  .option('log-file', {
    type: 'string',
    description: 'Log file to write to',
  })
  .option('prompt', {
    type: 'string',
    description: 'Prompt to send to Claude',
    alias: 'p',
  })
  .option('verbose', {
    type: 'boolean',
    description: 'Enable verbose logging',
    default: false,
  })
  .option('exit-on-idle', {
    type: 'string',
    description: 'Exit after a period of inactivity, e.g., "5s" or "1m"',
    alias: 'e',
  })
  .option('disable-lock', {
    type: 'boolean',
    description:
      'Disable the running lock feature that prevents concurrent agents in the same directory/repo',
    default: false,
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
const prompt: string | undefined = rawArgs
  .slice((dashIndex ?? cliArgIndex ?? 0) + 1)
  .join(' ');

console.clear();
console.info({ ...argv, cliArgsForSpawn, dashPrompts: prompt });
const { exitCode } = await cliYes({
  cli: cliName as SUPPORTED_CLIS,
  // prefer explicit --prompt / -p; otherwise use the text after `--` if present
  prompt: [argv.prompt, prompt].join(' ').trim() || undefined,
  exitOnIdle: argv.exitOnIdle ? enhancedMs(argv.exitOnIdle) : undefined,
  cliArgs: cliArgsForSpawn,
  // continueOnCrash: argv.continueOnCrash,
  logFile: argv.logFile,
  verbose: argv.verbose,
  disableLock: argv.disableLock,
});

process.exit(exitCode ?? 1);
