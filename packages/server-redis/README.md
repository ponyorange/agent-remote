# agent-remote-server-redis

Language: English | [简体中文](README.zh-CN.md)

Redis-backed session storage and message brokering for multi-instance Agent Remote server deployments.

## Installation

```bash
npm install agent-remote-server-redis agent-remote-server-core redis
```

`redis` is a peer dependency and must be `redis >=4.6.0`.

## When To Use

- Your server runs multiple Node.js instances.
- SSE or WebSocket connections may land on different instances.
- Tool calls created by one instance need to reach the instance holding the browser connection.
- Session tool lists and message history should be stored in Redis.

## Basic Usage

```ts
import { createClient } from "redis";
import { SessionManager } from "agent-remote-server-core";
import {
  RedisMessageBroker,
  RedisSessionStore,
  createRedisAgentConfig
} from "agent-remote-server-redis";

const config = createRedisAgentConfig(process.env.REDIS_URL!, "agent-remote");

const redisClient = createClient({ url: config.url });
const redisPublisher = createClient({ url: config.url });
const redisSubscriber = createClient({ url: config.url });

await Promise.all([
  redisClient.connect(),
  redisPublisher.connect(),
  redisSubscriber.connect()
]);

const store = new RedisSessionStore(redisClient, config);
const broker = new RedisMessageBroker(redisPublisher, redisSubscriber, config, {
  instanceId: process.env.INSTANCE_ID ?? "api-1",
  onProtocolDrop(reason, payload) {
    console.warn("Dropped Redis broker payload", reason, payload);
  }
});

const sessionManager = new SessionManager(store, broker);
```

## createRedisAgentConfig

```ts
const config = createRedisAgentConfig("redis://localhost:6379", "agent-remote");
```

- `url`: Redis connection URL, required.
- `keyPrefix`: Key and channel prefix, default `agent-remote`.

The function throws if `url` is empty.

## RedisSessionStore

`RedisSessionStore` implements `SessionStore`:

- `get(sessionId)`: Read session JSON from Redis.
- `set(sessionId, data)`: Write session JSON.
- `delete(sessionId)`: Delete a session.

Session key format:

```text
<keyPrefix>:session:<sessionId>
```

## RedisMessageBroker

`RedisMessageBroker` implements `MessageBroker` and uses Redis pub/sub to forward protocol messages between instances.

Channel format:

```text
<keyPrefix>:messages
```

Constructor options:

- `instanceId`: Current instance ID.
- `onProtocolDrop`: Callback for malformed payloads or invalid protocol messages.

## Multi-Instance Behavior

- Published broker messages include a `sourceId`.
- Messages published by the same instance are ignored to avoid duplicate delivery.
- Messages published by other instances are delivered to all local subscribed handlers.
- Payloads are validated with `validateProtocolMessage`; invalid payloads are dropped and reported through `onProtocolDrop`.

## Notes

- Use separate Redis clients for normal reads/writes, publish, and subscribe.
- This package depends only on minimal Redis client interfaces, so Redis-compatible clients can be adapted.
- Session data is currently stored as JSON strings in Redis.
