import type { AgentCliConfig } from '.';

export function defineAgentCliConfig<T extends Record<string, AgentCliConfig>>(
  config: T,
) {
  return config as Record<keyof T, AgentCliConfig>;
}
