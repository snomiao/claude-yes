// curried overload
export function catcher<F extends (...args: any[]) => any, R>(
  catchFn: (error: unknown, fn: F, ...args: Parameters<F>) => R,
): (fn: F) => (...args: Parameters<F>) => ReturnType<F> | R;

// direct overload
export function catcher<F extends (...args: any[]) => any, R>(
  catchFn: (error: unknown, fn: F, ...args: Parameters<F>) => R,
  fn: F,
): (...args: Parameters<F>) => ReturnType<F> | R;

/**
 * A utility function to wrap another function with a try-catch block.
 * If an error occurs during the execution of the function, the provided
 * catchFn is called with the error, the original function, and its arguments.
 *
 * This function supports both direct invocation and curried usage.
 *
 * @param catchFn - The function to call when an error occurs.
 * @param fn - The function to wrap (optional for curried usage).
 * @returns A new function that wraps the original function with error handling.
 */
export function catcher<F extends (...args: any[]) => any, R>(
  catchFn: (error: unknown, fn: F, ...args: Parameters<F>) => R,
  fn?: F,
) {
  if (!fn) return (fn: F) => catcher(catchFn, fn) as any;
  return (...args: Parameters<F>) => {
    try {
      return fn(...args);
    } catch (error) {
      return catchFn(error, fn, ...args);
    }
  };
}
