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
      deprecated: 'use --idle instead',
      default: '60s',
      alias: 'e',
    })
    .option('idle', {
      type: 'string',
      description: 'Exit after a period of inactivity, e.g., "5s" or "1m"',
      alias: 'i',
    })
    .option('queue', {
      type: 'boolean',
      description:
        'Queue Agent when spawning multiple agents in the same directory/repo, can be disabled with --no-queue',
      default: true,
    })
    .positional('cli', {
      describe:
        'The AI CLI to run, e.g., claude, codex, copilot, cursor, gemini',
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
      (parsedArgv.idle || parsedArgv.exitOnIdle)?.replace(/.*/, (e) =>
        String(enhancedMs(e)),
      ) || 0,
    ),
    queue: parsedArgv.queue,
    robust: parsedArgv.robust,
    logFile: parsedArgv.logFile,
    verbose: parsedArgv.verbose,
  };
}
