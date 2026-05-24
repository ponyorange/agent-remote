# agent-remote-server-node

语言：[English](README.md) | 简体中文

`agent-remote-server-node` 提供原生 Node.js HTTP router，不依赖 Express 或 Fastify 即可暴露 Agent Remote 的 SSE 和 HTTP POST 端点。

## 安装

```bash
npm install agent-remote-server-node agent-remote-server-core
```

## 基础用法

```ts
import http from "node:http";
import { AgentEngine, InMemoryStore, LocalBroker, SessionManager } from "agent-remote-server-core";
import { createNodeAgentRouter } from "agent-remote-server-node";

const sessionManager = new SessionManager(new InMemoryStore(), new LocalBroker());
const engine = new AgentEngine({
  llmClient,
  sessionManager
});

const server = http.createServer(createNodeAgentRouter(engine, {
  maxBodyBytes: 1024 * 1024,
  heartbeatIntervalMs: 30_000
}));

server.listen(3000);
```

## 默认路由

- `GET /sse?session_id=<id>`: 建立 SSE 连接。
- `POST /api/register_tools`: 注册工具。
- `POST /api/chat`: 发送用户消息。
- `POST /api/tool_result`: 返回工具执行结果。

不匹配的请求会返回 `404` JSON 响应。

## 自定义路由

```ts
const router = createNodeAgentRouter(engine, {
  routes: {
    sse: "/agent/sse",
    registerTools: "/agent/register-tools",
    chat: "/agent/chat",
    toolResult: "/agent/tool-result"
  }
});

const server = http.createServer(router);
```

## 会话认证

```ts
const router = createNodeAgentRouter(engine, {
  sessionAuth: {
    async verifySession({ sessionId, token }) {
      return sessionId.length > 0 && token === process.env.AGENT_REMOTE_SESSION_TOKEN;
    }
  }
});
```

token 可以来自：

- `Authorization: Bearer <token>`
- 查询参数 `token` 或 `session_token`
- 请求体 `sessionToken` 或 `session_token`

## 配置项

- `routes`: 覆盖默认路由。
- `maxBodyBytes`: POST body 最大字节数，默认 `1024 * 1024`。
- `sessionAuth`: 在接收 SSE 和 POST 请求前验证 session。
- `heartbeatIntervalMs`: SSE heartbeat 间隔，默认 `30_000`。

## 请求要求

- SSE 请求必须提供 `session_id` 或 `sessionId` 查询参数。
- POST body 必须是 JSON object，并包含 `sessionId` 或 `session_id`。
- 超过 `maxBodyBytes` 的 POST 请求会返回 `413`。
- 无效 JSON 会返回 `400`。
- 如果 engine 没有 `sessionManager`，SSE 路由会返回 `501`。

## 注意事项

- SSE 使用 `ServerResponse.writeHead()` 设置 `text/event-stream` 响应头。
- 客户端断开时 router 会清理 heartbeat 并 detach transport。
- 该包适合最小服务、边缘适配层或自定义框架集成。
