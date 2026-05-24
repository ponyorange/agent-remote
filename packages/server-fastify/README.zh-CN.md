# @agent-remote/server-fastify

语言：[English](README.md) | 简体中文

`@agent-remote/server-fastify` 提供 Fastify plugin，用于注册 Agent Remote 的 SSE 和 HTTP POST 路由。

## 安装

```bash
npm install @agent-remote/server-fastify @agent-remote/server-core fastify
```

`fastify` 是 peer dependency，要求 `fastify >=4.0.0`。

## 基础用法

```ts
import Fastify from "fastify";
import { AgentEngine, InMemoryStore, LocalBroker, SessionManager } from "@agent-remote/server-core";
import { createFastifyAgentPlugin } from "@agent-remote/server-fastify";

const fastify = Fastify();
const sessionManager = new SessionManager(new InMemoryStore(), new LocalBroker());
const engine = new AgentEngine({
  llmClient,
  sessionManager
});

await fastify.register(createFastifyAgentPlugin(engine, {
  heartbeatIntervalMs: 30_000
}));

await fastify.listen({ port: 3000 });
```

## 默认路由

- `GET /sse?session_id=<id>`: 建立 SSE 连接。
- `POST /api/register_tools`: 注册浏览器工具。
- `POST /api/chat`: 发送用户消息。
- `POST /api/tool_result`: 返回工具执行结果。

## 自定义路由

```ts
await fastify.register(createFastifyAgentPlugin(engine, {
  routes: {
    sse: "/agent/sse",
    registerTools: "/agent/register-tools",
    chat: "/agent/chat",
    toolResult: "/agent/tool-result"
  }
}));
```

浏览器端 SSE client 的 URL 配置需要与自定义路由一致。

## 会话认证

```ts
await fastify.register(createFastifyAgentPlugin(engine, {
  sessionAuth: {
    async verifySession({ sessionId, token }) {
      return sessionId.length > 0 && token === process.env.AGENT_REMOTE_SESSION_TOKEN;
    }
  }
}));
```

token 可以来自：

- `Authorization: Bearer <token>`
- 查询参数 `token` 或 `session_token`
- 请求体 `sessionToken` 或 `session_token`

## 配置项

- `routes`: 覆盖默认路由。
- `sessionAuth`: 在 SSE 和 POST 请求前验证 session。
- `heartbeatIntervalMs`: SSE heartbeat 间隔，默认 `30_000`。

## 请求要求

- SSE 请求必须提供 `session_id` 或 `sessionId` 查询参数。
- POST body 必须是 JSON object，并包含 `sessionId` 或 `session_id`。
- Fastify reply 需要可访问 `reply.raw`，因为 SSE 使用底层 raw stream。
- 如果 engine 没有 `sessionManager`，SSE 路由会返回 `501`。

## 注意事项

- plugin 会在 SSE 响应中调用 `reply.hijack?.()`。
- 客户端断开时 plugin 会清理 heartbeat 并 detach transport。
- route handler 会把已知请求错误转换为 JSON 错误响应。
