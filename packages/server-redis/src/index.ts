export interface RedisAgentConfig {
  url: string;
  keyPrefix: string;
}

export function createRedisAgentConfig(url: string, keyPrefix = "agent-remote"): RedisAgentConfig {
  if (!url) {
    throw new Error("Redis integration requires a url.");
  }

  return {
    url,
    keyPrefix
  };
}
