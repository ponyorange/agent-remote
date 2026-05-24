import { describe, expect, it } from "vitest";
import { createAssistantMessage } from "@agent-remote/core";
import {
  RedisMessageBroker,
  RedisSessionStore,
  createRedisAgentConfig,
  type RedisPubSubClient,
  type RedisSessionClient
} from "../src/index";

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

  it("stores and reads session data under a prefixed key", async () => {
    const redis = new FakeRedisClient();
    const store = new RedisSessionStore(redis, createRedisAgentConfig("redis://localhost:6379"));
    const data = {
      tools: [
        {
          name: "echo",
          description: "Echo input",
          parameters: { type: "object" },
          level: "L1" as const
        }
      ],
      messages: [{ role: "user" as const, content: "hello" }]
    };

    await store.set("session-1", data);

    expect(redis.values.get("agent-remote:session:session-1")).toBe(JSON.stringify(data));
    await expect(store.get("session-1")).resolves.toEqual(data);
  });

  it("returns null for missing sessions", async () => {
    const store = new RedisSessionStore(
      new FakeRedisClient(),
      createRedisAgentConfig("redis://localhost:6379")
    );

    await expect(store.get("missing")).resolves.toBeNull();
  });

  it("deletes stored sessions", async () => {
    const redis = new FakeRedisClient();
    const store = new RedisSessionStore(redis, createRedisAgentConfig("redis://localhost:6379"));

    await store.set("session-1", { tools: [], messages: [] });
    await store.delete("session-1");

    expect(redis.values.has("agent-remote:session:session-1")).toBe(false);
  });

  it("publishes protocol messages to a prefixed Redis channel", async () => {
    const redis = new FakeRedisClient();
    const broker = new RedisMessageBroker(
      redis,
      redis,
      createRedisAgentConfig("redis://localhost:6379", "custom-prefix")
    );
    const message = createAssistantMessage("Done");

    await broker.publish("session-1", message);

    expect(redis.published).toEqual([
      {
        channel: "custom-prefix:messages",
        payload: JSON.stringify({ sessionId: "session-1", message })
      }
    ]);
  });

  it("subscribes handlers to Redis channel messages", async () => {
    const redis = new FakeRedisClient();
    const broker = new RedisMessageBroker(
      redis,
      redis,
      createRedisAgentConfig("redis://localhost:6379")
    );
    const received: unknown[] = [];
    await broker.subscribe((sessionId, message) => {
      received.push({ sessionId, message });
    });
    const message = createAssistantMessage("Done");

    await redis.emit("agent-remote:messages", JSON.stringify({ sessionId: "session-1", message }));

    expect(received).toEqual([{ sessionId: "session-1", message }]);
  });

  it("ignores malformed broker payloads", async () => {
    const redis = new FakeRedisClient();
    const broker = new RedisMessageBroker(
      redis,
      redis,
      createRedisAgentConfig("redis://localhost:6379")
    );
    const received: unknown[] = [];
    await broker.subscribe((sessionId, message) => {
      received.push({ sessionId, message });
    });

    await redis.emit("agent-remote:messages", "not-json");
    await redis.emit("agent-remote:messages", JSON.stringify({ sessionId: "", message: {} }));

    expect(received).toEqual([]);
  });
});

class FakeRedisClient implements RedisSessionClient, RedisPubSubClient {
  readonly values = new Map<string, string>();
  readonly published: Array<{ channel: string; payload: string }> = [];
  private readonly subscriptions = new Map<string, Array<(payload: string) => void | Promise<void>>>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async del(key: string): Promise<void> {
    this.values.delete(key);
  }

  async publish(channel: string, payload: string): Promise<void> {
    this.published.push({ channel, payload });
  }

  async subscribe(
    channel: string,
    listener: (payload: string) => void | Promise<void>
  ): Promise<void> {
    const listeners = this.subscriptions.get(channel) ?? [];
    listeners.push(listener);
    this.subscriptions.set(channel, listeners);
  }

  async emit(channel: string, payload: string): Promise<void> {
    await Promise.all((this.subscriptions.get(channel) ?? []).map((listener) => listener(payload)));
  }
}
