import { appendFileSync, rmSync } from 'node:fs';
import tsaComposer from 'tsa-composer';
import winston from 'winston';
import { catcher } from './catcher';

// Create a dedicated logger for yesLog
const yesLogger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, message }) => {
      return `${timestamp} ${message}`;
    }),
  ),
  transports: [
    new winston.transports.File({
      filename: './agent-yes.log',
      options: { flags: 'a' }, // append mode
    }),
  ],
  silent: !process.env.VERBOSE,
});

/**
 * Log messages to agent-yes.log file using Winston
 * Each message is appended as a new line
 *
 * use only for debug, enabled when process.env.VERBOSE is set
 */
export const yesLog = tsaComposer()(
  catcher(
    (error) => {
      console.error('yesLog error:', error);
    },
    function yesLog(msg: string) {
      if (!process.env.VERBOSE) return; // no-op if not verbose
      yesLogger.debug(msg);
    },
  ),
);
