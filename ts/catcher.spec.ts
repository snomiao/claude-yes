import { describe, expect, it } from "vitest";
import { catcher } from "./catcher";

describe("catcher", () => {
  describe("curried overload", () => {
    it("should return a function when called with only catchFn", () => {
      const catchFn = () => "error";
      const result = catcher(catchFn);
      expect(typeof result).toBe("function");
    });

    it("should catch errors and call catchFn with error, function, and args", () => {
      let catchedError: unknown;
      let catchedFn: unknown;
      let catchedArgs: unknown[];
      const catchFn = (error: unknown, fn: unknown, ...args: unknown[]) => {
        catchedError = error;
        catchedFn = fn;
        catchedArgs = args;
        return "caught";
      };

      let calledArgs: unknown[] = [];
      const errorFn = (...args: unknown[]) => {
        calledArgs = args;
        throw new Error("test error");
      };

      const wrappedFn = catcher(catchFn)(errorFn);
      const result = wrappedFn("arg1", "arg2");

      expect(result).toBe("caught");
      expect(catchedError).toBeInstanceOf(Error);
      expect(catchedFn).toBe(errorFn);
      expect(catchedArgs).toEqual(["arg1", "arg2"]);
      expect(calledArgs).toEqual(["arg1", "arg2"]);
    });

    it("should return normal result when no error occurs", () => {
      let catchCalled = false;
      const catchFn = () => {
        catchCalled = true;
        return "error";
      };

      let calledArgs: unknown[] = [];
      const normalFn = (...args: unknown[]) => {
        calledArgs = args;
        return "success";
      };

      const wrappedFn = catcher(catchFn)(normalFn);
      const result = wrappedFn("arg1", "arg2");

      expect(result).toBe("success");
      expect(catchCalled).toBe(false);
      expect(calledArgs).toEqual(["arg1", "arg2"]);
    });
  });

  describe("direct overload", () => {
    it("should catch errors and call catchFn with error, function, and args directly", () => {
      let catchedError: unknown;
      let catchedFn: unknown;
      let catchedArgs: unknown[];
      const catchFn = (error: unknown, fn: unknown, ...args: unknown[]) => {
        catchedError = error;
        catchedFn = fn;
        catchedArgs = args;
        return "caught";
      };

      let calledArgs: unknown[] = [];
      const errorFn = (...args: unknown[]) => {
        calledArgs = args;
        throw new Error("test error");
      };

      const wrappedFn = catcher(catchFn, errorFn);
      const result = wrappedFn("arg1", "arg2");

      expect(result).toBe("caught");
      expect(catchedError).toBeInstanceOf(Error);
      expect(catchedFn).toBe(errorFn);
      expect(catchedArgs).toEqual(["arg1", "arg2"]);
      expect(calledArgs).toEqual(["arg1", "arg2"]);
    });

    it("should return normal result when no error occurs directly", () => {
      let catchCalled = false;
      const catchFn = () => {
        catchCalled = true;
        return "error";
      };

      let calledArgs: unknown[] = [];
      const normalFn = (...args: unknown[]) => {
        calledArgs = args;
        return "success";
      };

      const wrappedFn = catcher(catchFn, normalFn);
      const result = wrappedFn("arg1", "arg2");

      expect(result).toBe("success");
      expect(catchCalled).toBe(false);
      expect(calledArgs).toEqual(["arg1", "arg2"]);
    });
  });

  describe("error handling", () => {
    it("should handle different error types and pass function context", () => {
      const results: unknown[] = [];
      const functions: unknown[] = [];
      const catchFn = (error: unknown, fn: unknown, ..._args: unknown[]) => {
        results.push(error);
        functions.push(fn);
        return "handled";
      };

      // String error
      const stringErrorFn = () => {
        throw "string error";
      };
      const wrappedStringFn = catcher(catchFn, stringErrorFn);
      expect(wrappedStringFn()).toBe("handled");
      expect(results[0]).toBe("string error");
      expect(functions[0]).toBe(stringErrorFn);

      // Object error
      const objectError = { message: "object error" };
      const objectErrorFn = () => {
        throw objectError;
      };
      const wrappedObjectFn = catcher(catchFn, objectErrorFn);
      expect(wrappedObjectFn()).toBe("handled");
      expect(results[1]).toBe(objectError);
      expect(functions[1]).toBe(objectErrorFn);

      // null error
      const nullErrorFn = () => {
        throw null;
      };
      const wrappedNullFn = catcher(catchFn, nullErrorFn);
      expect(wrappedNullFn()).toBe("handled");
      expect(results[2]).toBe(null);
      expect(functions[2]).toBe(nullErrorFn);
    });

    it("should preserve function parameters and pass them to catchFn", () => {
      let caughtError: unknown;
      let caughtFn: unknown;
      let caughtArgs: unknown[];
      const catchFn = (error: unknown, fn: unknown, ...args: unknown[]) => {
        caughtError = error;
        caughtFn = fn;
        caughtArgs = args;
        return "caught";
      };

      let testArgs: [number, string, boolean] | undefined;
      const testFn = (a: number, b: string, c: boolean) => {
        testArgs = [a, b, c];
        if (a > 5) throw new Error("too big");
        return `${a}-${b}-${c}`;
      };

      const wrappedFn = catcher(catchFn, testFn);

      // Normal execution
      expect(wrappedFn(3, "test", true)).toBe("3-test-true");
      expect(testArgs).toEqual([3, "test", true]);

      // Error execution
      expect(wrappedFn(10, "error", false)).toBe("caught");
      expect(testArgs).toEqual([10, "error", false]);
      expect(caughtError).toBeInstanceOf(Error);
      expect(caughtFn).toBe(testFn);
      expect(caughtArgs).toEqual([10, "error", false]);
    });

    it("should handle functions with no parameters", () => {
      let caughtError: unknown;
      let caughtFn: unknown;
      let caughtArgs: unknown[];
      const catchFn = (error: unknown, fn: unknown, ...args: unknown[]) => {
        caughtError = error;
        caughtFn = fn;
        caughtArgs = args;
        return "no params caught";
      };

      let called = false;
      const noParamsFn = () => {
        called = true;
        throw new Error("no params error");
      };

      const wrappedFn = catcher(catchFn, noParamsFn);
      const result = wrappedFn();

      expect(result).toBe("no params caught");
      expect(called).toBe(true);
      expect(caughtError).toBeInstanceOf(Error);
      expect(caughtFn).toBe(noParamsFn);
      expect(caughtArgs).toEqual([]);
    });

    it("should handle functions returning different types", () => {
      const catchFn = () => null;

      // Function returning number
      const numberFn = catcher(catchFn, () => 42);
      expect(numberFn()).toBe(42);

      // Function returning object
      const obj = { key: "value" };
      const objectFn = catcher(catchFn, () => obj);
      expect(objectFn()).toBe(obj);

      // Function returning undefined
      const undefinedFn = catcher(catchFn, () => undefined);
      expect(undefinedFn()).toBeUndefined();
    });
  });

  describe("type safety", () => {
    it("should maintain function signature", () => {
      const catchFn = (_error: unknown, _fn: unknown, ..._args: unknown[]) => "error";
      const originalFn = (a: number, b: string): string => `${a}-${b}`;

      const wrappedFn = catcher(catchFn, originalFn);

      // This should be type-safe
      const result: string = wrappedFn(1, "test");
      expect(result).toBe("1-test");
    });

    it("should pass function reference and arguments to catchFn", () => {
      let capturedFn: unknown;
      let capturedArgs: unknown[];
      const catchFn = (error: unknown, fn: unknown, ...args: unknown[]) => {
        capturedFn = fn;
        capturedArgs = args;
        return "handled";
      };

      const testFn = (_x: number, _y: string) => {
        throw new Error("test");
      };

      const wrappedFn = catcher(catchFn, testFn);
      wrappedFn(42, "hello");

      expect(capturedFn).toBe(testFn);
      expect(capturedArgs).toEqual([42, "hello"]);
    });
  });
});
