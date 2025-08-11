#!/usr/bin/env node
import ms from 'enhanced-ms';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import claudeYes from '.';

// cli entry point
const argv = yargs(hideBin(process.argv))
  .usage('Usage: $0 [options] [--] [claude args]')
  .example(
    '$0 --exit-on-idle=30s --continue-on-crash "help me solve all todos in my codebase"',
    'Run Claude with a 30 seconds idle timeout and continue on crash'
  )

  .option('exit-on-idle', {
    type: 'string',
    default: '60s',
    description: 'Exit after being idle for specified duration',
  })
  .option('continue-on-crash', {
    type: 'boolean',
    default: true,
    description: 'Continue running even if Claude crashes',
  })
  .option('log-file', {
    type: 'string',
    description: 'Path to log file for output logging',
  })
  .option('verbose', {
    type: 'boolean',
    default: false,
    description: 'Enable verbose logging',
  })
  .parserConfiguration({
    'unknown-options-as-args': true,
    'halt-at-non-option': true,
  })
  .parseSync();

const {
  exitOnIdle: exitOnIdleArg,
  continueOnCrash: continueOnCrashArg,
  logFile,
  ...rest
} = argv;

const claudeArgs = argv._.map((e) => String(e));
const exitOnIdle = argv.exitOnIdle != null ? ms(argv.exitOnIdle) : undefined;

argv.verbose &&
  console.debug('[claude-yes] Parsed args:', {
    exitOnIdle,
    continueOnCrash: continueOnCrashArg,
    claudeArgs,
  });

await claudeYes({
  exitOnIdle,
  claudeArgs,
  continueOnCrash: continueOnCrashArg,
  logFile,
});
