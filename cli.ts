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
  })
  .option('log-file', {
    type: 'string',
    description: 'Log file to write to',
  })
  .option('cli', {
    type: 'string',
    description:
      'Claude CLI command, e.g. "claude", "gemini", "codex", default is "claude"',
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
  })
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

console.clear();
const { exitCode, logs } = await claudeYes({
  cli: argv.cli,
  prompt: argv.prompt,
  exitOnIdle: argv.exitOnIdle ? enhancedMs(argv.exitOnIdle) : undefined,
  cliArgs: argv._.map((e) => String(e)),
  continueOnCrash: argv.continueOnCrash,
  logFile: argv.logFile,
  verbose: argv.verbose,
});

process.exit(exitCode ?? 1);
