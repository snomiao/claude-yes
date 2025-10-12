import { appendFileSync, rmSync } from 'node:fs';
import tsaComposer from 'tsa-composer';
import { catcher } from './tryCatch';

let initial = true;

/**
 * Log messages to agent-yes.log file
 * Each message is appended as a new line
 * The log file is cleared on the first call
 *
 * for debug
 */
export const yesLog = tsaComposer()(
  catcher(
    (error) => {
      console.error('yesLog error:', error);
    },
    function yesLog(msg: string) {
      // process.stdout.write(`${msg}\r`); // touch process to avoid "The process is not running a TTY." error
      if (!process.env.VERBOSE) return; // no-op if not verbose
      if (initial) rmSync('./agent-yes.log'); // ignore error if file doesn't exist
      initial = false;
      appendFileSync('./agent-yes.log', `${msg}\n`);
    },
  ),
);
