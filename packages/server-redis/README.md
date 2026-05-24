# @agent-remote/server-redis

Redis-backed session store and message broker for multi-instance deployments.

## Usage

```ts
import { RedisMessageBroker, RedisSessionStore, createRedisAgentConfig } from "@agent-remote/server-redis";

const config = createRedisAgentConfig(process.env.REDIS_URL!);
const store = new RedisSessionStore(redisClient, config);
const broker = new RedisMessageBroker(redisPublisher, redisSubscriber, config, {
  instanceId: "api-1",
  onProtocolDrop(reason) {
    logger.warn({ reason }, "Dropped Redis broker payload");
  }
});
```

The broker ignores messages published by the same instance and reports malformed payloads through `onProtocolDrop`.
