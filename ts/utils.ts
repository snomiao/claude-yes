export function sleepms(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
export function deepMixin<T>(target: T, source: DeepPartial<T>): T {
  for (const key in source) {
    if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
      if (!target[key] || typeof target[key] !== "object") {
        (target as any)[key] = {};
      }
      deepMixin(target[key], source[key] as any);
    } else if (source[key] !== undefined) {
      (target as any)[key] = source[key];
    }
  }
  return target;
}
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
