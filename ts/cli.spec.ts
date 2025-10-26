import { vi } from 'vitest';

// Mock cliYes function
const mockCliYes = vi.fn(async ({ prompt }) => {
  return { exitCode: 0, logs: 'mocked logs' };
});

test('CLI args parsing', () => {
  const rawArgs = ['claude', '--verbose', '--idle=5m', '--', 'write tests'];
  const optionalIndex = (e: number) => (0 <= e ? e : undefined);
  const dashIndex = optionalIndex(rawArgs.indexOf('--'));
  const dashPrompt = dashIndex
    ? rawArgs.slice(dashIndex + 1).join(' ')
    : undefined;

  expect(dashPrompt).toBe('write tests');
  expect(mockCliYes).toBeDefined();
});
