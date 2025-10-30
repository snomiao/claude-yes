import { describe, expect, it } from 'vitest';
import { catcher } from './tryCatch';

describe('tryCatch', () => {
  describe('curried overload', () => {
    it('should return a function when called with only catchFn', () => {
      const catchFn = () => 'error';
      const result = catcher(catchFn);
      expect(typeof result).toBe('function');
    });

    it('should catch errors and call catchFn', () => {
      let catchedError: unknown;
      const catchFn = (error: unknown) => {
        catchedError = error;
        return 'caught';
      };

      let calledArgs: unknown[] = [];
      const errorFn = (...args: unknown[]) => {
        calledArgs = args;
        throw new Error('test error');
      };

      const wrappedFn = catcher(catchFn)(errorFn);
      const result = wrappedFn('arg1', 'arg2');

      expect(result).toBe('caught');
      expect(catchedError).toBeInstanceOf(Error);
      expect(calledArgs).toEqual(['arg1', 'arg2']);
    });

    it('should return normal result when no error occurs', () => {
      let catchCalled = false;
      const catchFn = () => {
        catchCalled = true;
        return 'error';
      };

      let calledArgs: unknown[] = [];
      const normalFn = (...args: unknown[]) => {
        calledArgs = args;
        return 'success';
      };

      const wrappedFn = catcher(catchFn)(normalFn);
      const result = wrappedFn('arg1', 'arg2');

      expect(result).toBe('success');
      expect(catchCalled).toBe(false);
      expect(calledArgs).toEqual(['arg1', 'arg2']);
    });
  });

  describe('direct overload', () => {
    it('should catch errors and call catchFn directly', () => {
      let catchedError: unknown;
      const catchFn = (error: unknown) => {
        catchedError = error;
        return 'caught';
      };

      let calledArgs: unknown[] = [];
      const errorFn = (...args: unknown[]) => {
        calledArgs = args;
        throw new Error('test error');
      };

      const wrappedFn = catcher(catchFn, errorFn);
      const result = wrappedFn('arg1', 'arg2');

      expect(result).toBe('caught');
      expect(catchedError).toBeInstanceOf(Error);
      expect(calledArgs).toEqual(['arg1', 'arg2']);
    });

    it('should return normal result when no error occurs directly', () => {
      let catchCalled = false;
      const catchFn = () => {
        catchCalled = true;
        return 'error';
      };

      let calledArgs: unknown[] = [];
      const normalFn = (...args: unknown[]) => {
        calledArgs = args;
        return 'success';
      };

      const wrappedFn = catcher(catchFn, normalFn);
      const result = wrappedFn('arg1', 'arg2');

      expect(result).toBe('success');
      expect(catchCalled).toBe(false);
      expect(calledArgs).toEqual(['arg1', 'arg2']);
    });
  });

  describe('error handling', () => {
    it('should handle different error types', () => {
      const results: unknown[] = [];
      const catchFn = (error: unknown) => {
        results.push(error);
        return 'handled';
      };

      // String error
      const stringErrorFn = catcher(catchFn, () => {
        throw 'string error';
      });
      expect(stringErrorFn()).toBe('handled');
      expect(results[0]).toBe('string error');

      // Object error
      const objectError = { message: 'object error' };
      const objectErrorFn = catcher(catchFn, () => {
        throw objectError;
      });
      expect(objectErrorFn()).toBe('handled');
      expect(results[1]).toBe(objectError);

      // null error
      const nullErrorFn = catcher(catchFn, () => {
        throw null;
      });
      expect(nullErrorFn()).toBe('handled');
      expect(results[2]).toBe(null);
    });

    it('should preserve function parameters', () => {
      let caughtError: unknown;
      const catchFn = (error: unknown) => {
        caughtError = error;
        return 'caught';
      };

      let testArgs: [number, string, boolean] | undefined;
      const testFn = (a: number, b: string, c: boolean) => {
        testArgs = [a, b, c];
        if (a > 5) throw new Error('too big');
        return `${a}-${b}-${c}`;
      };

      const wrappedFn = catcher(catchFn, testFn);

      // Normal execution
      expect(wrappedFn(3, 'test', true)).toBe('3-test-true');
      expect(testArgs).toEqual([3, 'test', true]);

      // Error execution
      expect(wrappedFn(10, 'error', false)).toBe('caught');
      expect(testArgs).toEqual([10, 'error', false]);
      expect(caughtError).toBeInstanceOf(Error);
    });

    it('should handle functions with no parameters', () => {
      let caughtError: unknown;
      const catchFn = (error: unknown) => {
        caughtError = error;
        return 'no params caught';
      };

      let called = false;
      const noParamsFn = () => {
        called = true;
        throw new Error('no params error');
      };

      const wrappedFn = catcher(catchFn, noParamsFn);
      const result = wrappedFn();

      expect(result).toBe('no params caught');
      expect(called).toBe(true);
      expect(caughtError).toBeInstanceOf(Error);
    });

    it('should handle functions returning different types', () => {
      const catchFn = () => null;

      // Function returning number
      const numberFn = catcher(catchFn, () => 42);
      expect(numberFn()).toBe(42);

      // Function returning object
      const obj = { key: 'value' };
      const objectFn = catcher(catchFn, () => obj);
      expect(objectFn()).toBe(obj);

      // Function returning undefined
      const undefinedFn = catcher(catchFn, () => undefined);
      expect(undefinedFn()).toBeUndefined();
    });
  });

  describe('type safety', () => {
    it('should maintain function signature', () => {
      const catchFn = (error: unknown) => 'error';
      const originalFn = (a: number, b: string): string => `${a}-${b}`;

      const wrappedFn = catcher(catchFn, originalFn);

      // This should be type-safe
      const result: string = wrappedFn(1, 'test');
      expect(result).toBe('1-test');
    });
  });
});
