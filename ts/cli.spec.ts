import enhancedMs from 'enhanced-ms';
import { describe, expect, it } from 'vitest';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { SUPPORTED_CLIS } from '.';

/**
 * Parse CLI arguments the same way cli.ts does
 * This is a test helper that mirrors the parsing logic in cli.ts
 */
function parseCliArgs(argv: string[]) {
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

describe('CLI argument parsing', () => {
  it('should parse cli name from first positional argument', () => {
    const result = parseCliArgs(['node', '/path/to/cli', 'claude']);

    expect(result.cli).toBe('claude');
  });

  it('should parse prompt from --prompt flag', () => {
    const result = parseCliArgs([
      'node',
      '/path/to/cli',
      '--prompt',
      'hello world',
      'claude',
    ]);

    expect(result.prompt).toBe('hello world');
  });

  it('should parse prompt from -- separator', () => {
    const result = parseCliArgs([
      'node',
      '/path/to/cli',
      'claude',
      '--',
      'hello',
      'world',
    ]);

    expect(result.prompt).toBe('hello world');
  });

  it('should combine --prompt and -- prompt', () => {
    const result = parseCliArgs([
      'node',
      '/path/to/cli',
      '--prompt',
      'part1',
      'claude',
      '--',
      'part2',
    ]);

    expect(result.prompt).toBe('part1 part2');
  });

  it('should parse --idle flag', () => {
    const result = parseCliArgs([
      'node',
      '/path/to/cli',
      '--idle',
      '30s',
      'claude',
    ]);

    expect(result.exitOnIdle).toBe(30000);
  });

  it('should parse --exit-on-idle flag (deprecated)', () => {
    const result = parseCliArgs([
      'node',
      '/path/to/cli',
      '--exit-on-idle',
      '1m',
      'claude',
    ]);

    expect(result.exitOnIdle).toBe(60000);
  });

  it('should parse --robust flag', () => {
    const result = parseCliArgs(['node', '/path/to/cli', '--robust', 'claude']);

    expect(result.robust).toBe(true);
  });

  it('should parse --no-robust flag', () => {
    const result = parseCliArgs([
      'node',
      '/path/to/cli',
      '--no-robust',
      'claude',
    ]);

    expect(result.robust).toBe(false);
  });

  it('should parse --queue flag', () => {
    const result = parseCliArgs(['node', '/path/to/cli', '--queue', 'claude']);

    expect(result.queue).toBe(true);
  });

  it('should parse --no-queue flag', () => {
    const result = parseCliArgs([
      'node',
      '/path/to/cli',
      '--no-queue',
      'claude',
    ]);

    expect(result.queue).toBe(false);
  });

  it('should parse --logFile flag', () => {
    const result = parseCliArgs([
      'node',
      '/path/to/cli',
      '--logFile',
      './output.log',
      'claude',
    ]);

    expect(result.logFile).toBe('./output.log');
  });

  it('should parse --verbose flag', () => {
    const result = parseCliArgs([
      'node',
      '/path/to/cli',
      '--verbose',
      'claude',
    ]);

    expect(result.verbose).toBe(true);
  });

  it('should pass through unknown CLI args to cliArgs', () => {
    const result = parseCliArgs([
      'node',
      '/path/to/cli',
      'claude',
      '--unknown-flag',
      'value',
    ]);

    expect(result.cliArgs).toContain('--unknown-flag');
    expect(result.cliArgs).toContain('value');
  });

  it('should separate cli-yes args from cli args before --', () => {
    const result = parseCliArgs([
      'node',
      '/path/to/cli',
      '--robust',
      'claude',
      '--claude-arg',
      '--',
      'prompt',
    ]);

    expect(result.cli).toBe('claude');
    expect(result.robust).toBe(true);
    expect(result.cliArgs).toContain('--claude-arg');
    expect(result.prompt).toBe('prompt');
  });

  it('should detect cli name from script name (claude-yes)', () => {
    const result = parseCliArgs([
      '/usr/bin/node',
      '/usr/local/bin/claude-yes',
      '--prompt',
      'test',
    ]);

    expect(result.cli).toBe('claude');
  });

  it('should detect cli name from script name (codex-yes)', () => {
    const result = parseCliArgs([
      '/usr/bin/node',
      '/usr/local/bin/codex-yes',
      '--prompt',
      'test',
    ]);

    expect(result.cli).toBe('codex');
  });

  it('should prefer script name over explicit cli argument', () => {
    const result = parseCliArgs([
      '/usr/bin/node',
      '/usr/local/bin/claude-yes',
      '--prompt',
      'test',
      'gemini',
    ]);

    // cliName (from script) takes precedence over positional arg
    expect(result.cli).toBe('claude');
  });

  it('should handle empty cliArgs when no positional cli is provided', () => {
    const result = parseCliArgs([
      '/usr/bin/node',
      '/usr/local/bin/claude-yes',
      '--prompt',
      'prompt',
    ]);

    expect(result.cliArgs).toEqual([]);
    expect(result.prompt).toBe('prompt');
  });

  it('should include all args when no -- separator is present', () => {
    const result = parseCliArgs([
      'node',
      '/path/to/cli',
      'claude',
      '--some-flag',
      '--another-flag',
    ]);

    expect(result.cliArgs).toContain('--some-flag');
    expect(result.cliArgs).toContain('--another-flag');
  });
});
