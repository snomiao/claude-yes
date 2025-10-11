export function tryCatch<T, R>(
  fn: () => T,
  catchFn: (error: unknown) => R,
): T | R {
  try {
    return fn();
  } catch (error) {
    return catchFn(error);
  }
}
