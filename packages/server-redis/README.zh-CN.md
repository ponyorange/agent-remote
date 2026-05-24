# agent-remote-server-redis

语言：[English](README.md) | 简体中文

`agent-remote-server-redis` 提供 Redis 会话存储和消息 broker，用于 Agent Remote 多实例服务部署。

## 安装

```bash
npm install agent-remote-server-redis agent-remote-server-core redis
```

`redis` 是 peer dependency，要求 `redis >=4.6.0`。

## 适用场景

- 服务端有多个 Node.js 实例。
- SSE 或 WebSocket 连接可能落在不同实例上。
- 某个实例产生的工具调用需要发送到持有浏览器连接的实例。
- 会话工具列表和消息历史需要存储在 Redis 中。

## 基础用法

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

- `url`: Redis 连接 URL，必填。
- `keyPrefix`: key 和 channel 前缀，默认 `agent-remote`。

如果 `url` 为空，函数会抛出错误。

## RedisSessionStore

`RedisSessionStore` 实现 `SessionStore`：

- `get(sessionId)`: 从 Redis 读取 session JSON。
- `set(sessionId, data)`: 写入 session JSON。
- `delete(sessionId)`: 删除 session。

session key 格式：

```text
<keyPrefix>:session:<sessionId>
```

## RedisMessageBroker

`RedisMessageBroker` 实现 `MessageBroker`，使用 Redis pub/sub 在实例之间转发协议消息。

channel 格式：

```text
<keyPrefix>:messages
```

构造参数：

- `instanceId`: 当前实例 ID。
- `onProtocolDrop`: malformed payload 或无效协议消息的回调。

## 多实例行为

- broker 发布消息时会带上 `sourceId`。
- 收到自己实例发布的消息时会忽略，避免重复投递。
- 收到其他实例发布的消息时，会调用所有本地订阅 handler。
- payload 会经过 `validateProtocolMessage` 校验；无效 payload 会被丢弃并触发 `onProtocolDrop`。

## 注意事项

- 建议使用独立 Redis client 分别处理普通读写、publish 和 subscribe。
- 本包只依赖最小 Redis client 接口，因此也可以适配兼容 Redis API 的客户端。
- Redis 中的 session 数据当前以 JSON 字符串存储。
