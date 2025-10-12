import type { AgentCliConfig, CliYesConfig } from '.';

type Awaitable<T> = T | Promise<T>;
export async function defineCliYesConfig<T extends CliYesConfig>(
  cfg: Awaitable<T> | ((original: T) => Awaitable<T>),
) {
  if (typeof cfg === 'function') cfg = await cfg({ clis: {} } as T);

  return cfg as unknown as {
    clis: Record<string, AgentCliConfig>;
  };
}
