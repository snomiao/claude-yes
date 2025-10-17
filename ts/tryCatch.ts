// curried overload
export function catcher<F extends (...args: any[]) => any, R>(
  catchFn: (error: unknown) => R,
): (fn: F) => (...args: Parameters<F>) => ReturnType<F> | R;

// direct overload
export function catcher<F extends (...args: any[]) => any, R>(
  catchFn: (error: unknown) => R,
  fn: F,
): (...args: Parameters<F>) => ReturnType<F> | R;

// implementation
export function catcher<F extends (...args: any[]) => any, R>(
  catchFn: (error: unknown) => R,
  fn?: F,
) {
  if (!fn) return (fn: F) => catcher(catchFn, fn) as any;
  return (...args: Parameters<F>) => {
    try {
      return fn(...args);
    } catch (error) {
      return catchFn(error);
    }
  };
}
