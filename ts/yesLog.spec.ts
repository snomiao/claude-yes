import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('yesLog', () => {
  const originalVerbose = process.env.VERBOSE;

  beforeEach(() => {
    // Reset modules to ensure fresh state
    delete require.cache[require.resolve('./yesLog')];
  });

  afterEach(() => {
    // Restore original VERBOSE setting
    if (originalVerbose !== undefined) {
      process.env.VERBOSE = originalVerbose;
    } else {
      delete process.env.VERBOSE;
    }
  });

  it('should not crash when VERBOSE is not set', async () => {
    delete process.env.VERBOSE;

    const { yesLog } = await import('./yesLog');

    // Should not throw and returns undefined
    const result = yesLog`Test message`;
    expect(result).toBeUndefined();
  });

  it('should be callable with template literals', async () => {
    delete process.env.VERBOSE;

    const { yesLog } = await import('./yesLog');

    // Should not throw with variables
    const variable = 'test value';
    const result = yesLog`Message with ${variable}`;
    expect(result).toBeUndefined();
  });

  it('should handle multiple calls', async () => {
    delete process.env.VERBOSE;

    const { yesLog } = await import('./yesLog');

    // Multiple calls should not throw
    expect(yesLog`First message`).toBeUndefined();
    expect(yesLog`Second message`).toBeUndefined();
    expect(yesLog`Third message`).toBeUndefined();
  });

  it('should work when VERBOSE is set', async () => {
    process.env.VERBOSE = '1';

    const { yesLog } = await import('./yesLog');

    // Should not throw even when verbose
    expect(yesLog`Verbose message`).toBeUndefined();
  });

  it('should handle template literals with different types', async () => {
    delete process.env.VERBOSE;

    const { yesLog } = await import('./yesLog');

    const number = 42;
    const object = { key: 'value' };
    const array = [1, 2, 3];

    expect(yesLog`Number: ${number}`).toBeUndefined();
    expect(yesLog`Object: ${object}`).toBeUndefined();
    expect(yesLog`Array: ${array}`).toBeUndefined();
  });
});
