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
    'Run Claude with a 30 seconds idle timeout and continue on crash',
  )
  .option('exit-on-idle', {
    type: 'string',
    default: '60s',
    description:
      'Exit after being idle for specified duration, default 1min, set to 0 to disable this behaviour',
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

const { exitCode, logs } = await claudeYes({
  exitOnIdle: argv.exitOnIdle != null ? ms(argv.exitOnIdle) : undefined,
  claudeArgs: argv._.map((e) => String(e)),
  continueOnCrash: argv.continueOnCrash,
  logFile: argv.logFile,
  verbose: argv.verbose,
});

process.exit(exitCode ?? 1);
