import { validateProtocolMessage, type ProtocolMessage } from "agent-remote-core";
import type { MessageBroker, MessageHandler, SessionData, SessionStore } from "agent-remote-server-core";

export interface RedisAgentConfig {
  url: string;
  keyPrefix: string;
}

export interface RedisSessionClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

export interface RedisPubSubClient {
  publish(channel: string, payload: string): Promise<unknown>;
  subscribe(channel: string, listener: (payload: string) => void | Promise<void>): Promise<unknown>;
}

export interface RedisMessageBrokerOptions {
  instanceId?: string;
  onProtocolDrop?: (reason: string, payload?: unknown) => void;
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

export class RedisSessionStore implements SessionStore {
  constructor(
    private readonly redis: RedisSessionClient,
    private readonly config: RedisAgentConfig
  ) {}

  async get(sessionId: string): Promise<SessionData | null> {
    const value = await this.redis.get(this.sessionKey(sessionId));

    if (!value) {
      return null;
    }

    return JSON.parse(value) as SessionData;
  }

  async set(sessionId: string, data: SessionData): Promise<void> {
    await this.redis.set(this.sessionKey(sessionId), JSON.stringify(data));
  }

  async delete(sessionId: string): Promise<void> {
    await this.redis.del(this.sessionKey(sessionId));
  }

  private sessionKey(sessionId: string): string {
    return `${this.config.keyPrefix}:session:${sessionId}`;
  }
}

export class RedisMessageBroker implements MessageBroker {
  private readonly handlers = new Set<MessageHandler>();
  private readonly instanceId: string;
  private readonly onProtocolDrop?: (reason: string, payload?: unknown) => void;
  private subscribed = false;

  constructor(
    private readonly publisher: RedisPubSubClient,
    private readonly subscriber: RedisPubSubClient,
    private readonly config: RedisAgentConfig,
    options: RedisMessageBrokerOptions = {}
  ) {
    this.instanceId = options.instanceId ?? createInstanceId();
    this.onProtocolDrop = options.onProtocolDrop;
  }

  async publish(sessionId: string, message: ProtocolMessage, sourceId = this.instanceId): Promise<void> {
    await this.publisher.publish(
      this.channel,
      JSON.stringify({
        sourceId,
        sessionId,
        message
      })
    );
  }

  async subscribe(handler: MessageHandler): Promise<void> {
    this.handlers.add(handler);

    if (this.subscribed) {
      return;
    }

    this.subscribed = true;
    await this.subscriber.subscribe(this.channel, async (payload) => {
      const event = parseBrokerPayload(payload);

      if (!event) {
        this.onProtocolDrop?.("malformed_payload", payload);
        return;
      }

      if (event.sourceId === this.instanceId) {
        return;
      }

      await Promise.all(
        [...this.handlers].map((listener) => listener(event.sessionId, event.message, event.sourceId))
      );
    });
  }

  private get channel(): string {
    return `${this.config.keyPrefix}:messages`;
  }
}

function parseBrokerPayload(
  payload: string
): { sourceId?: string; sessionId: string; message: ProtocolMessage } | null {
  try {
    const parsed = JSON.parse(payload) as unknown;

    if (!isRecord(parsed) || typeof parsed.sessionId !== "string" || !parsed.sessionId) {
      return null;
    }

    const result = validateProtocolMessage(parsed.message);

    if (!result.ok) {
      return null;
    }

    return {
      ...(typeof parsed.sourceId === "string" ? { sourceId: parsed.sourceId } : {}),
      sessionId: parsed.sessionId,
      message: result.value
    };
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function createInstanceId(): string {
  return `redis-broker-${Math.random().toString(36).slice(2)}`;
}
