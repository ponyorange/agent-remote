# @agent-remote/server-express

语言：[English](README.md) | 简体中文

`@agent-remote/server-express` 提供 Express 兼容 router，用于暴露 Agent Remote 的 SSE 下行通道和 HTTP POST 上行端点。

## 安装

```bash
npm install @agent-remote/server-express @agent-remote/server-core express
```

`express` 是 peer dependency，要求 `express >=4.18.0`。

## 基础用法

```ts
import express from "express";
import { AgentEngine, InMemoryStore, LocalBroker, SessionManager } from "@agent-remote/server-core";
import { createExpressAgentRouter } from "@agent-remote/server-express";

const sessionManager = new SessionManager(new InMemoryStore(), new LocalBroker());
const engine = new AgentEngine({
  llmClient,
  sessionManager
});

const app = express();
app.use(express.json());
app.use(createExpressAgentRouter(engine));
app.listen(3000);
```

## 默认路由

- `GET /sse?session_id=<id>`: 建立 SSE 连接，并把 transport 绑定到 `sessionId`。
- `POST /api/register_tools`: 接收 `{ sessionId, tools }`，注册浏览器工具。
- `POST /api/chat`: 接收 `{ sessionId, text, messageId? }`，发送用户消息。
- `POST /api/tool_result`: 接收 `{ sessionId, result }` 或直接接收 tool result 字段。

## 自定义路由

```ts
app.use(createExpressAgentRouter(engine, {
  routes: {
    sse: "/agent/sse",
    registerTools: "/agent/register-tools",
    chat: "/agent/chat",
    toolResult: "/agent/tool-result"
  }
}));
```

浏览器端 SSE client 的 `postUrls` 必须与这些路由保持一致。

## 会话认证

```ts
app.use(createExpressAgentRouter(engine, {
  sessionAuth: {
    async verifySession({ sessionId, token }) {
      return sessionId.length > 0 && token === process.env.AGENT_REMOTE_SESSION_TOKEN;
    }
  }
}));
```

token 读取来源：

- `Authorization: Bearer <token>`
- 查询参数 `token` 或 `session_token`
- 请求体 `sessionToken` 或 `session_token`

## 配置项

- `routes`: 覆盖默认路由。
- `sessionAuth`: 在接收 SSE 和 POST 请求前验证 session。
- `heartbeatIntervalMs`: SSE heartbeat 间隔，默认 `30_000`。

## 请求要求

- POST 请求需要在 Express 中提前启用 JSON body parser，例如 `app.use(express.json())`。
- SSE 请求必须提供 `session_id` 或 `sessionId` 查询参数。
- POST body 必须包含 `sessionId` 或 `session_id`。
- 如果 engine 没有 `sessionManager`，SSE 路由会返回 `501`。

## 注意事项

- SSE 响应会设置 `content-type: text/event-stream`、`cache-control: no-cache, no-transform` 和 `x-accel-buffering: no`。
- 客户端断开时 router 会 detach 对应 transport。
- 不匹配的请求会调用 `next()`，因此可以和其他 Express route 组合使用。
