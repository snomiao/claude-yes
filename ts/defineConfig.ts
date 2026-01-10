import type { AgentCliConfig, AgentYesConfig } from ".";

type Awaitable<T> = T | Promise<T>;
export async function defineCliYesConfig<T extends AgentYesConfig>(
  cfg: Awaitable<T> | ((original: T) => Awaitable<T>),
) {
  if (typeof cfg === "function") cfg = await cfg({ clis: {} } as T);

  return cfg as unknown as Omit<AgentYesConfig, "clis"> & {
    clis: Record<string, AgentCliConfig>;
  };
}
