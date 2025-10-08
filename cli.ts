#!/usr/bin/env node
import enhancedMs from 'enhanced-ms';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import claudeYes from '.';

// cli entry point
const argv = yargs(hideBin(process.argv))
  .usage('Usage: $0 [options] [claude args] [--] [prompts...]')
  .example(
    '$0 --exit-on-idle=30s --continue-on-crash "help me solve all todos in my codebase"',
    'Run Claude with a 30 seconds idle timeout and continue on crash',
  )
  .option('continue-on-crash', {
    type: 'boolean',
    default: true,
    description:
      'spawn Claude with --continue if it crashes, only works for claude',
    alias: 'c',
  })
  .option('log-file', {
    type: 'string',
    description: 'Log file to write to',
  })
  .option('cli', {
    type: 'string',
    description:
      'CLI command to run. Supports: claude, gemini, codex, copilot, cursor, grok. Defaults to the CLI inferred from the executable name or "claude".',
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
  .help()
  .version()
  .parserConfiguration({
    'unknown-options-as-args': true,
    'halt-at-non-option': true,
  })
  .parseSync();

// detect cli name for cli, while package.json have multiple bin link: {"claude-yes": "cli.js", "codex-yes": "cli.js", "gemini-yes": "cli.js"}
if (!argv.cli) {
  const cliName = process.argv[1]?.split('/').pop()?.split('-')[0];
  argv.cli = cliName || 'claude';
}

// Support: everything after a literal `--` is a prompt string. Example:
//   claude-yes --exit-on-idle=30s -- "help me refactor this"
// In that example the prompt will be `help me refactor this` and won't be
// passed as args to the underlying CLI binary.
const rawArgs = process.argv.slice(2);
const dashIndex = rawArgs.indexOf('--');
let promptFromDash: string | undefined = undefined;
let cliArgsForSpawn: string[] = [];
if (dashIndex !== -1) {
  // join everything after `--` into a single prompt string
  const after = rawArgs.slice(dashIndex + 1);
  promptFromDash = after.join(' ');
  // use everything before `--` as the cli args
  cliArgsForSpawn = rawArgs.slice(0, dashIndex).map(String);
} else {
  // fallback to yargs parsed positional args when `--` is not used
  cliArgsForSpawn = argv._.map((e) => String(e));
}

console.clear();
const { exitCode, logs } = await claudeYes({
  cli: argv.cli,
  // prefer explicit --prompt / -p; otherwise use the text after `--` if present
  prompt: argv.prompt || promptFromDash,
  exitOnIdle: argv.exitOnIdle ? enhancedMs(argv.exitOnIdle) : undefined,
  cliArgs: cliArgsForSpawn,
  continueOnCrash: argv.continueOnCrash,
  logFile: argv.logFile,
  verbose: argv.verbose,
  disableLock: argv.disableLock,
});

process.exit(exitCode ?? 1);
