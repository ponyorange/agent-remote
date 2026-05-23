import { describe, expect, it } from "vitest";
import { createRedisAgentConfig } from "../src/index";

describe("@agent-remote/server-redis", () => {
  it("creates a redis adapter config with a default key prefix", () => {
    expect(createRedisAgentConfig("redis://localhost:6379")).toEqual({
      url: "redis://localhost:6379",
      keyPrefix: "agent-remote"
    });
  });

  it("requires a redis url", () => {
    expect(() => createRedisAgentConfig("")).toThrow("Redis integration requires a url.");
  });
});
