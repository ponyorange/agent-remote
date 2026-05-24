# agent-remote

语言：[English](README.md) | 简体中文

`agent-remote` 是一个 Rush 管理的 TypeScript monorepo，用于把浏览器应用中的安全工具暴露给 AI agent，并通过可替换的传输层连接浏览器端 SDK 与服务端 SDK。

## 适用场景

- 让 AI agent 调用浏览器页面内的受控工具，例如修改 UI、读取页面状态、触发应用动作。
- 在浏览器与服务端之间建立统一协议，让工具注册、用户消息、工具调用和工具结果可以跨传输层工作。
- 在 Express、Fastify 或原生 Node HTTP 服务中快速接入 Agent Remote 路由。
- 在单实例服务中使用内存会话，在多实例部署中使用 Redis 同步会话状态和消息。

## 快速开始

本仓库使用 Rush + pnpm。推荐先运行完整构建和示例测试：

```bash
npm install -g @microsoft/rush@5.120.0
rush install
rush build
rush test -t agent-remote-example-express-sse-react
```

可运行示例位于 `examples/express-sse-react`。它使用已发布包入口，打开 SSE 连接，在浏览器端注册一个低风险工具，并验证服务端可以发送 `agent_remote:tool_call`。

## 架构概览

1. 浏览器应用通过 `agent-remote-client` 或 `agent-remote-react` 创建客户端。
2. 客户端注册 `ToolDefinition`，并通过 SSE 或 WebSocket 与服务端建立连接。
3. 服务端适配器接收工具注册、用户消息和工具结果。
4. `agent-remote-server-core` 管理会话、LLM 编排、工具策略、工具搜索和向浏览器发送工具调用。
5. 浏览器执行工具后返回 `ToolResult`，服务端继续把结果交给 LLM。

## 协议消息

`agent-remote-core` 定义协议版本 `AGENT_REMOTE_PROTOCOL_VERSION = "0.1.0"`，消息类型都使用 `agent_remote:` 前缀。

- `agent_remote:hello`: WebSocket 握手消息。
- `agent_remote:hello_ack`: WebSocket 握手确认。
- `agent_remote:register_tools`: 浏览器注册工具。
- `agent_remote:user_message`: 用户发给 agent 的文本消息。
- `agent_remote:assistant_message`: 服务端返回给浏览器的 assistant 文本。
- `agent_remote:tool_call`: 服务端请求浏览器执行工具。
- `agent_remote:tool_result`: 浏览器返回工具执行结果。
- `agent_remote:error`: 协议或执行错误。

## 包总览

核心协议与类型：

- `agent-remote-core`: 共享协议类型、消息工厂、结构校验和传输层接口。

浏览器端：

- `agent-remote-client`: 框架无关的浏览器 SDK，用于注册工具、发送用户消息、执行服务端工具调用。
- `agent-remote-react`: React hook 和状态管理辅助工具，让 Agent Remote 客户端生命周期跟随组件。

传输层：

- `agent-remote-transport-sse`: 浏览器通过 SSE 接收服务端消息，并通过 HTTP POST 发送客户端消息。
- `agent-remote-transport-ws`: WebSocket 传输层，支持双向消息、重连和服务端 socket 包装。

服务端：

- `agent-remote-server-core`: 框架无关服务端核心，包含 `AgentEngine`、`SessionManager`、内存存储、LLM 客户端接口和 OpenAI 兼容客户端。
- `agent-remote-server-express`: Express 路由适配器，提供 SSE 和 HTTP POST 端点。
- `agent-remote-server-fastify`: Fastify plugin，提供同样的 Agent Remote 端点。
- `agent-remote-server-node`: 原生 Node.js HTTP router，无需 Web 框架即可接入。
- `agent-remote-server-redis`: Redis 会话存储和消息 broker，用于多实例部署。

示例：

- `agent-remote-example-express-sse-react`: 私有示例项目，演示 Express + SSE + React 的端到端链路。

## 如何选择包

- 非 React 浏览器应用：安装 `agent-remote-client`，并选择 `agent-remote-client/sse` 或 `agent-remote-client/ws`。
- React 应用：安装 `agent-remote-react` 和 `agent-remote-client`，用 `useAgentClient` 管理连接、状态和清理。
- Express 服务：安装 `agent-remote-server-core` 与 `agent-remote-server-express`。
- Fastify 服务：安装 `agent-remote-server-core` 与 `agent-remote-server-fastify`。
- 原生 Node HTTP 服务：安装 `agent-remote-server-core` 与 `agent-remote-server-node`。
- 单实例服务：使用 `InMemoryStore` 和 `LocalBroker`。
- 多实例服务：增加 `agent-remote-server-redis`，用 Redis 同步会话和跨实例消息。

## npm 包使用教程

按运行环境只安装需要的包：

```bash
# 浏览器客户端，包含 SSE / WebSocket 辅助入口
npm install agent-remote-client

# React 集成
npm install agent-remote-react agent-remote-client

# Express 服务端适配器
npm install agent-remote-server-core agent-remote-server-express express

# Fastify 服务端适配器
npm install agent-remote-server-core agent-remote-server-fastify fastify

# 原生 Node HTTP 适配器
npm install agent-remote-server-core agent-remote-server-node

# Redis 多实例部署
npm install agent-remote-server-redis redis
```

按应用层导入对应包：

```ts
import { createSSEClient } from "agent-remote-client/sse";
import { useAgentClient } from "agent-remote-react";
import { AgentEngine, SessionManager } from "agent-remote-server-core";
import { createExpressAgentRouter } from "agent-remote-server-express";
```

## 最小浏览器客户端

```ts
import { createSSEClient } from "agent-remote-client/sse";

const client = createSSEClient({
  kind: "sse",
  sseUrl: "/sse",
  sessionId: "session-1",
  retryAttempts: 1,
  postUrls: {
    registerTools: "/api/register_tools",
    sendMessage: "/api/chat",
    toolResult: "/api/tool_result"
  }
});

client.registry.register(
  {
    name: "change_background",
    description: "Change the page background color.",
    parameters: {
      type: "object",
      properties: {
        color: { type: "string" }
      },
      required: ["color"]
    },
    risk: "low",
    domain: "ui",
    tags: ["demo"]
  },
  (args) => {
    const input = args as { color?: string };
    document.body.style.backgroundColor = input.color ?? "white";
    return { color: document.body.style.backgroundColor };
  }
);

await client.connect();
await client.sendUserMessage("Change the background to blue");
```

高风险工具会触发确认逻辑：当工具定义包含 `risk: "high"` 或 `level: "L3"` 时，`BrowserAgentClient` 会调用 `confirmToolCall`。

## 最小服务端

```ts
import express from "express";
import { AgentEngine, InMemoryStore, LocalBroker, SessionManager } from "agent-remote-server-core";
import { createExpressAgentRouter } from "agent-remote-server-express";

const sessionManager = new SessionManager(new InMemoryStore(), new LocalBroker());
const engine = new AgentEngine({
  llmClient,
  sessionManager,
  toolPolicy: {
    async filterTools(_sessionId, tools) {
      return tools.filter((tool) => tool.risk !== "high");
    }
  }
});

const app = express();
app.use(express.json());
app.use(createExpressAgentRouter(engine));
app.listen(3000);
```

默认路由：

- `GET /sse?session_id=<id>`: 建立 SSE 下行通道。
- `POST /api/register_tools`: 注册浏览器工具。
- `POST /api/chat`: 发送用户消息。
- `POST /api/tool_result`: 返回工具执行结果。

## 会话认证

服务端适配器支持 `sessionAuth`。你可以从 `Authorization: Bearer <token>`、查询参数 `token` / `session_token`，或请求体 `sessionToken` / `session_token` 中读取 token。

```ts
app.use(createExpressAgentRouter(engine, {
  sessionAuth: {
    async verifySession({ sessionId, token }) {
      return sessionId.length > 0 && token === process.env.AGENT_REMOTE_SESSION_TOKEN;
    }
  }
}));
```

## 开发命令

安装依赖：

```bash
npm install -g @microsoft/rush@5.120.0
rush install
```

构建、测试和类型检查：

```bash
rush build
rush test
rush lint
```

只运行某个包：

```bash
rush build -t agent-remote-client
rush test -t agent-remote-example-express-sse-react
rush lint -t agent-remote-server-core
```

`rush lint` 当前运行每个包的 `tsc --noEmit` 脚本；默认检查链路不包含 ESLint。

## 发布流程

仓库配置了 Changesets 相关 Rush 命令：

```bash
rush changeset
rush version-packages
rush publish-packages
```

`packages/*` 中的公开包都包含 `publishConfig.access = "public"`。示例包 `agent-remote-example-express-sse-react` 是私有包，不发布到 npm。

## 兼容性

- Node.js: `>=18.18.0 <23.0.0`。
- Package manager: 通过 Rush 使用 `pnpm@8.15.0`。
- Rush: `5.120.0`。
- TypeScript: `~5.4.5`。
- React 集成：`react >=18.0.0`。
- 协议版本：`0.1.0`。

## 许可证

MIT
