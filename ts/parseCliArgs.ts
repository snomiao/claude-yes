import enhancedMs from 'enhanced-ms';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { SUPPORTED_CLIS } from '.';

/**
 * Parse CLI arguments the same way cli.ts does
 * This is a test helper that mirrors the parsing logic in cli.ts
 */
export function parseCliArgs(argv: string[]) {
  // Detect cli name from script name (same logic as cli.ts:10-14)
  const cliName = ((e?: string) => {
    if (e === 'cli' || e === 'cli.ts') return undefined;
    return e;
  })(argv[1]?.split('/').pop()?.split('-')[0]);

  // Parse args with yargs (same logic as cli.ts:16-73)
  const parsedArgv = yargs(hideBin(argv))
    .option('robust', {
      type: 'boolean',
      default: true,
      alias: 'r',
    })
    .option('logFile', {
      type: 'string',
    })
    .option('prompt', {
      type: 'string',
      alias: 'p',
    })
    .option('verbose', {
      type: 'boolean',
      default: false,
    })
    .option('exit-on-idle', {
      type: 'string',
      alias: 'e',
    })
    .option('idle', {
      type: 'string',
      alias: 'i',
    })
    .option('queue', {
      type: 'boolean',
      default: true,
    })
    .positional('cli', {
      type: 'string',
      choices: SUPPORTED_CLIS,
      demandOption: false,
      default: cliName,
    })
    .parserConfiguration({
      'unknown-options-as-args': true,
      'halt-at-non-option': true,
    })
    .parseSync();

  // Extract cli args and dash prompt (same logic as cli.ts:76-91)
  const optionalIndex = (e: number) => (0 <= e ? e : undefined);
  const rawArgs = argv.slice(2);
  const cliArgIndex = optionalIndex(rawArgs.indexOf(String(parsedArgv._[0])));
  const dashIndex = optionalIndex(rawArgs.indexOf('--'));

  const cliArgsForSpawn = parsedArgv._[0]
    ? rawArgs.slice(cliArgIndex ?? 0, dashIndex ?? undefined)
    : [];
  const dashPrompt: string | undefined = dashIndex
    ? rawArgs.slice(dashIndex + 1).join(' ')
    : undefined;

  // Return the config object that would be passed to cliYes (same logic as cli.ts:99-121)
  return {
    cli: (cliName ||
      parsedArgv.cli ||
      parsedArgv._[0]
        ?.toString()
        ?.replace?.(/-yes$/, '')) as (typeof SUPPORTED_CLIS)[number],
    cliArgs: cliArgsForSpawn,
    prompt: [parsedArgv.prompt, dashPrompt].join(' ').trim() || undefined,
    exitOnIdle: Number(
      (parsedArgv.exitOnIdle || parsedArgv.idle)?.replace(/.*/, (e) =>
        String(enhancedMs(e)),
      ) || 0,
    ),
    queue: parsedArgv.queue,
    robust: parsedArgv.robust,
    logFile: parsedArgv.logFile,
    verbose: parsedArgv.verbose,
  };
}
