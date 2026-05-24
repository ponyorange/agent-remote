---

# agent-remote 技术方案

## 让 AI Agent 安全、高效地调用浏览器端工具

---

## 1. 文档概述

### 1.1 背景

当前 AI Agent 的工具调用大多局限在服务端（调用 API、数据库、本地函数），无法直接操作运行在用户浏览器中的功能。随着 Web 应用复杂度的提升，大量核心能力（DOM 操作、Web API、设备传感器、富交互组件）必须在前端执行。虽然市面上已有基于浏览器自动化的 MCP 工具（如 playwright-mcp），它们侧重于**让 Agent 操控一个独立的浏览器访问外部网页**，却缺少一种**让任意 Web 应用将自身业务能力暴露给 AI Agent**的标准化方案。

### 1.2 目标

**agent-remote** 提供一套完整的、传输无关的前后端 SDK，使 AI Agent 能够：

- 动态发现浏览器中注册的任意工具（由网页开发者定义）
- 通过安全的双向通道向浏览器下发工具调用指令
- 实时接收工具执行结果，并继续多步推理
- 在数百个工具场景下保持 LLM 上下文高效、精准
- 轻松扩展至多实例生产环境

支持 WebSocket 和 SSE+HTTP 两种传输模式，提供开箱即用的客户端、服务端核心、多种 Web 框架适配器、React 集成，以及可插拔的 Redis 多实例部署方案。

### 1.3 与竞品的差异

| 维度 | 浏览器自动化方案（MCP） | agent-remote |
|------|------------------------|---------------|
| 操控对象 | 独立浏览器访问外部网站 | 嵌入到已有 Web 应用中操作自身 |
| 工具来源 | 浏览器原生能力（点击、导航） | 业务方自定义的业务工具（导出、修改配置） |
| 典型场景 | 自动化测试、数据抓取 | SaaS 产品 AI 助手、Web 后台智能操作 |
| 集成方式 | MCP Server / Playwright 脚本 | 前端 SDK 一行注册，后端引擎即插即用 |

---

## 2. 系统架构

```
 ┌─────────────────────────┐               WebSocket / SSE+HTTP         ┌────────────────────────────┐
 │       浏览器              │◄───────────────────────────────────────────►│       后端 Agent 服务        │
 │                          │                                            │                            │
 │  ┌────────────────────┐  │                                            │  ┌──────────────────────┐  │
│  │ agent-remote-client │  │   agent_remote:register_tools             │  │ agent-remote-server-core │  │
 │  │     client         │  │   agent_remote:tool_call (SSE 推送)       │  │    server-core       │  │
 │  │                    │  │   agent_remote:tool_result (POST)        │  │                      │  │
 │  │  ToolRegistry      │  │   agent_remote:user_message /            │  │ SessionStore         │  │
 │  │  AgentClient       │  │   agent_remote:assistant_message          │  │ MessageBroker        │  │
 │  └────────────────────┘  │                                            │  │ AgentEngine          │  │
 │                          │                                            │  └──────────────────────┘  │
 │  基于 transport-ws       │                                            │  基于 transport-ws       │
 │  或 transport-sse        │                                            │  或 transport-sse        │
 └─────────────────────────┘                                            └────────────────────────────┘
```

- **传输层抽象**：定义统一的 `TransportConnection` 接口，WebSocket 和 SSE 均实现它。
- **协议层**：前后端使用带前缀的 JSON 消息格式（`agent_remote:` 命名空间），避免与用户业务消息冲突。
- **服务端核心**：完全与 Web 框架解耦，通过适配器挂载到 Express、Fastify、原生 HTTP 等。
- **存储与消息**：提供内存实现和 Redis 实现，支持单实例到多实例的无缝切换。

---

## 3. 包结构

采用 pnpm monorepo，公开包使用无 scope 的 `agent-remote-*` 命名，各包职责如下：

| 包名 | 描述 | 依赖 |
|------|------|------|
| `agent-remote-core` | 共享类型、传输接口、JSON Schema 工具 | - |
| `agent-remote-transport-ws` | WebSocket 传输层实现（前后端通用） | core |
| `agent-remote-transport-sse` | SSE+HTTP 传输层实现（前后端通用） | core |
| `agent-remote-client` | 浏览器端 SDK（工具注册、执行、连接管理） | core, transport-* |
| `agent-remote-server-core` | 服务端核心（会话管理、LLM 编排、工具检索） | core |
| `agent-remote-server-express` | Express 适配器 | server-core, transport-sse |
| `agent-remote-server-fastify` | Fastify 适配器 | server-core, transport-sse |
| `agent-remote-server-node` | 原生 HTTP 适配器（兼容 Koa） | server-core, transport-sse |
| `agent-remote-server-redis` | Redis 会话存储与消息代理 | server-core |
| `agent-remote-react` | React Hooks | client |

### 3.1 npm 包使用教程

消费者按运行环境安装所需包。浏览器端只需要客户端包，服务端选择对应 Web 框架适配器，多实例部署再加入 Redis 包：

```bash
npm install agent-remote-client
npm install agent-remote-react agent-remote-client
npm install agent-remote-server-core agent-remote-server-express express
npm install agent-remote-server-core agent-remote-server-fastify fastify
npm install agent-remote-server-core agent-remote-server-node
npm install agent-remote-server-redis redis
```

主要入口示例：

```ts
import { createSSEClient } from "agent-remote-client/sse";
import { createWSClient } from "agent-remote-client/ws";
import { useAgentClient } from "agent-remote-react";
import { AgentEngine, SessionManager } from "agent-remote-server-core";
import { createExpressAgentRouter } from "agent-remote-server-express";
```

---

## 4. 通信协议

### 4.1 工具定义（ToolDefinition）

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema7;      // 标准 JSON Schema
  level?: 'L1' | 'L2' | 'L3';   // 分级，默认 L1
  domain?: string;               // 领域分类，如 'ui'、'data'、'export'
  tags?: string[];               // 辅助标签
}
```

### 4.2 消息类型（带命名空间前缀）

为防止与用户应用层消息冲突，所有协议消息的 `type` 字段均使用 `agent_remote:` 前缀：

| 类型 | 方向 | 说明 | 关键字段 |
|------|------|------|----------|
| `agent_remote:register_tools` | 前端→后端 | 注册当前可用的工具列表 | `tools: ToolDefinition[]` |
| `agent_remote:tool_call` | 后端→前端 | 要求前端执行指定工具 | `callId`, `name`, `arguments` |
| `agent_remote:tool_result` | 前端→后端 | 工具执行结果 | `callId`, `ok`, `result?`, `error?` |
| `agent_remote:user_message` | 前端→后端 | 用户输入的自然语言 | `text` |
| `agent_remote:assistant_message` | 后端→前端 | Agent 最终文本回复 | `text` |
| `agent_remote:error` | 双向 | 错误信息 | `message` |

**示例消息**：
```json
{
  "type": "agent_remote:tool_call",
  "callId": "uuid-1234",
  "name": "change_background_color",
  "arguments": { "color": "blue" }
}
```

所有 SDK 内部的消息路由、序列化/反序列化均基于此前缀进行识别，用户自定义的普通消息（如 `chat_message`、`heartbeat`）将不会触发 Agent 逻辑。

---

## 5. 传输层设计

### 5.1 抽象接口

定义在 `agent-remote-core` 中，屏蔽具体传输细节：

```typescript
interface TransportConnection {
  send(message: any): void;
  onMessage(handler: (message: any) => void): void;
  close(): void;
}
```

### 5.2 WebSocket 实现

- **前端**：封装原生 `WebSocket`，自动处理 JSON 序列化/反序列化，提供重连机制。
- **服务端**：基于 `ws` 库，为每个 WebSocket 连接创建 `TransportConnection`。

### 5.3 SSE + HTTP 实现

- **前端**：使用 `EventSource` 接收推送（事件类型为 `agent_remote:tool_call` 等），使用 `fetch` 发送 POST 请求到对应端点。
- **服务端**：向 `http.ServerResponse` 写入 SSE 事件流，并监听 POST 端点。`session_id` 通过 URL 参数或请求体传递。

### 5.4 可观测性 v1

当前实现只提供轻量 hook，不直接绑定 OpenTelemetry：

- `AgentEngineOptions.observer.onLLMRequest/onLLMResponse/onToolCall` 可转接到 pino、winston、OTel span 或自定义 metrics。
- `BrowserAgentClientOptions.onProtocolDrop` 会报告非法协议消息，避免静默丢弃难以排查。
- `RedisMessageBrokerOptions.onProtocolDrop` 会报告 Redis broker 收到的 malformed payload。
- `AgentRemoteLogger` 是 `agent-remote-core` 暴露的最小 logger shape，用于后续 adapter 注入日志实现。

---

## 6. 浏览器端 SDK（agent-remote-client）

### 6.1 ToolRegistry

管理工具定义和真实执行函数：

```typescript
class ToolRegistry {
  register(definition: ToolDefinition, handler: (args: any) => Promise<any>): void;
  unregister(name: string): void;
  getDefinitions(): ToolDefinition[];
  execute(call: ToolCall): Promise<ToolResult>;
}
```

### 6.2 BrowserAgentClient

组合传输层和工具注册表，提供完整生命周期：

```typescript
class BrowserAgentClient {
  constructor(transport: TransportConnection);
  readonly registry: ToolRegistry;

  async connect(): Promise<void>;        // 建立连接并自动发送 agent_remote:register_tools
  sendUserMessage(text: string): Promise<void>;   // 发送 agent_remote:user_message
  on(event: 'message' | 'error', handler: (data: any) => void): () => void;
  disconnect(): Promise<void>;
}
```

内部逻辑：监听 `agent_remote:tool_call`，调用 `registry.execute`，将结果包装为 `agent_remote:tool_result` 回传；监听 `agent_remote:assistant_message` 触发回调。所有非 `agent_remote:` 前缀的消息将被忽略。

### 6.3 工厂函数

```typescript
// WebSocket 客户端
import { createWSClient } from 'agent-remote-client/ws';
const client = createWSClient({ url: 'ws://localhost:8080' });

// SSE 客户端
import { createSSEClient } from 'agent-remote-client/sse';
const client = createSSEClient({
  kind: 'sse',
  sseUrl: '/sse',
  postUrls: {
    registerTools: '/api/register_tools',
    sendMessage: '/api/chat',
    toolResult: '/api/tool_result'
  },
  sessionId: crypto.randomUUID()
});
```

---

## 7. 服务端核心 SDK（agent-remote-server-core）

完全无框架依赖，仅依赖 `agent-remote-core`。

### 7.1 会话存储与消息代理接口

```typescript
interface SessionData {
  tools: ToolDefinition[];
  messages: ChatMessage[];
}

interface SessionStore {
  get(sessionId: string): Promise<SessionData | null>;
  set(sessionId: string, data: SessionData): Promise<void>;
  delete(sessionId: string): Promise<void>;
}

interface MessageBroker {
  publish(sessionId: string, message: ProtocolMessage): Promise<void>;
  subscribe(handler: (sessionId: string, message: ProtocolMessage) => void): Promise<void>;
}
```

默认提供 `InMemoryStore` 和 `LocalBroker`（单实例），亦可使用 `agent-remote-server-redis`。

### 7.2 SessionManager

```typescript
class SessionManager {
  private connections: Map<string, Map<symbol, TransportConnection>>; // 本地连接
  constructor(store: SessionStore, broker: MessageBroker);

  async getData(id: string): Promise<SessionData | null>;
  async saveData(id: string, data: SessionData): Promise<void>;

  async ready(): Promise<void>;
  attachTransport(id: string, transport: TransportConnection): TransportHandle;
  detachTransport(id: string, handle?: TransportHandle): void;

  async sendToSession(id: string, msg: ProtocolMessage): Promise<void>;
}
```

`sendToSession` 会先等待 broker 订阅就绪，然后优先广播到本地连接；若本地无连接则通过 `MessageBroker` 发布到其他实例。

### 7.3 LLMClient 接口

```typescript
interface LLMClient {
  chat(params: { messages: ChatMessage[]; tools: ToolDefinition[] }): Promise<LLMResponse>;
}
```

内置 `OpenAILLMClient`，可方便替换为其他模型。

### 7.4 AgentEngine

```typescript
class AgentEngine {
  constructor(options: {
    llmClient: LLMClient;
    sessionManager: SessionManager;
    maxSearchResults?: number;
  });

  async handleRegisterTools(sessionId: string, tools: ToolDefinition[]): Promise<void>;
  async handleUserMessage(sessionId: string, text: string): Promise<void>;
  async handleToolResult(sessionId: string, result: ToolResult): Promise<void>;
}
```

核心流程：
1. `handleUserMessage` 将用户消息追加到会话历史，调用 LLM，若返回 `tool_calls` 则推送到前端。
2. `handleToolResult` 将工具执行结果加入历史，继续调用 LLM，生成最终回复或下一轮工具调用。
3. 在处理 `tool_calls` 时拦截内置元工具 `search_tools`（见第 8 章），在服务端直接完成检索，结果注入上下文，再次请求 LLM。

所有对外推送消息均使用 `agent_remote:tool_call` 或 `agent_remote:assistant_message` 类型。

---

## 8. 工具分层、领域分类与动态检索

### 8.1 动机

当工具数量膨胀至上百个，全部放入 LLM 上下文会消耗大量 token 并降低推理质量。agent-remote 内置了一套高效管理机制。

### 8.2 分级 (Level)

- **L1（核心工具）**：高频、关键操作，始终在 LLM 上下文中。数量应严格控制。
- **L2+（扩展工具）**：仅通过 `search_tools` 按需暴露。

前端注册时指定 `level`，服务端 `SessionManager` 自动分类存储。

### 8.3 领域 (Domain)

工具可指定 `domain` 字段，如 `ui`、`data`、`export`、`navigation`、`device` 等。服务端构建领域索引以加速检索。

### 8.4 内置元工具 search_tools

AgentEngine 会把 L1 工具和一个虚拟 `search_tools` 工具暴露给 LLM：

```json
{
  "name": "search_tools",
  "description": "搜索可用的工具。可按领域过滤。",
  "parameters": {
    "type": "object",
    "properties": {
      "query": { "type": "string", "description": "搜索关键词" },
      "maxResults": { "type": "number", "description": "返回最大数量，默认5" }
    },
    "required": ["query"]
  }
}
```

当 LLM 决定调用 `search_tools` 时，AgentEngine 拦截，执行本地关键词检索（基于名称、描述、领域、标签匹配），将结果列表以 tool 消息形式注入上下文，再次请求 LLM。

该过程对前端完全透明，前端只会收到最终的实际 `agent_remote:tool_call`。

### 8.5 配置选项

- `maxSearchResults` 控制 `search_tools` 默认返回数量。

---

## 9. 多实例部署与 Redis 集成

### 9.1 挑战

水平扩展时，长连接（WS/SSE）固定在某实例上，而后续 HTTP 请求可能被负载均衡到另一实例。需要解决：
- 会话状态（工具列表、对话历史）跨实例共享
- 推送消息能路由到持有连接的正确实例

### 9.2 解决方案

引入 `SessionStore` 和 `MessageBroker` 两个抽象，默认提供内存实现，通过 `agent-remote-server-redis` 提供 Redis 实现。

- **RedisSessionStore**：将 `SessionData` 以 JSON 形式持久化到 Redis。
- **RedisMessageBroker**：基于 Redis Pub/Sub 实现跨实例消息路由。发布的消息仍然是 `agent_remote:` 前缀的协议消息，并携带 broker instance id 以避免自发布回环。

#### 部署模式

1. **粘性会话（推荐）**：负载均衡器根据 `session_id` 将请求固定到同一实例，只需 `RedisSessionStore` 保证状态不丢失，性能最优。
2. **无粘性会话**：任何请求可达任意实例，完全依赖 `RedisSessionStore + RedisMessageBroker`。某实例处理请求后，通过 Pub/Sub 将推送消息转给持有连接的实例。

### 9.3 使用方式

单实例（默认）：
```typescript
const engine = new AgentEngine({
  llmClient: new OpenAILLMClient({ apiKey: process.env.OPENAI_API_KEY!, model: 'gpt-4.1-mini' }),
  sessionManager: new SessionManager(new InMemoryStore(), new LocalBroker())
});
```

多实例 Redis：
```typescript
import { createClient } from 'redis';
import { RedisSessionStore, RedisMessageBroker, createRedisAgentConfig } from 'agent-remote-server-redis';

const config = createRedisAgentConfig('redis://...');
const redis = createClient({ url: config.url });
const redisSubscriber = redis.duplicate();
await redis.connect();
await redisSubscriber.connect();

const store = new RedisSessionStore(redis, config);
const broker = new RedisMessageBroker(redis, redisSubscriber, config);
const engine = new AgentEngine({
  llmClient,
  sessionManager: new SessionManager(store, broker)
});
await engine.sessionManager.ready();
```

适配器代码无需任何修改。

---

## 10. Web 框架适配器

服务端核心无框架依赖，通过以下包适配不同框架。

### 10.1 Node 原生 HTTP（agent-remote-server-node）

```typescript
import http from 'http';
import { createNodeAgentRouter } from 'agent-remote-server-node';

const router = createNodeAgentRouter(engine);
http.createServer(router).listen(3000);
```

Koa 可直接复用：`app.use(async ctx => router(ctx.req, ctx.res))`。

### 10.2 Express（agent-remote-server-express）

```typescript
import express from 'express';
import { createExpressAgentRouter } from 'agent-remote-server-express';

const app = express();
app.use(express.json());
app.use(createExpressAgentRouter(engine));
app.listen(3000);
```

### 10.3 Fastify（agent-remote-server-fastify）

```typescript
import Fastify from 'fastify';
import { createFastifyAgentPlugin } from 'agent-remote-server-fastify';

const fastify = Fastify();
fastify.register(createFastifyAgentPlugin(engine));
fastify.listen({ port: 3000 });
```

### 10.4 NestJS

无需专门适配器，底层若为 Express 或 Fastify，直接挂载对应的中间件/插件；也可封装为 NestJS Module（文档提供示例）。

### 10.5 WebSocket 挂载（与框架无关）

```typescript
import { createWebSocketServerTransport } from 'agent-remote-transport-ws';

webSocketServer.on('connection', (socket, request) => {
  const sessionId = new URL(request.url!, 'http://localhost').searchParams.get('session_id')!;
  const transport = createWebSocketServerTransport(socket);
  const handle = engine.sessionManager.attachTransport(sessionId, transport);

  transport.onMessage(async (message) => {
    switch (message.type) {
      case 'agent_remote:register_tools':
        await engine.handleRegisterTools(sessionId, message.tools);
        break;
      case 'agent_remote:user_message':
        await engine.handleUserMessage(sessionId, message.text);
        break;
      case 'agent_remote:tool_result':
        await engine.handleToolResult(sessionId, message);
        break;
    }
  });

  socket.on('close', () => engine.sessionManager.detachTransport(sessionId, handle));
});
```

---

## 11. 与大模型生态的集成

### 11.1 OpenAI

直接使用内置 `OpenAILLMClient`，工具定义完全兼容 Function Calling 格式，零适配。

### 11.2 LangChain / LangGraph

当前版本不提供单独的 LangChain 适配包。需要接入 LangChain / LangGraph 时，使用 `agent-remote-core` 的 `ToolDefinition` 自行映射到对应框架的 tool 结构，或将 `AgentEngine` 放入服务端图流程节点。

未来如果新增独立包，会在 package exports 和本文档中同步列出真实入口。

---

## 12. React 集成（agent-remote-react）

```tsx
import { useAgentClient } from 'agent-remote-react';
import { createWSClient } from 'agent-remote-client/ws';

function App() {
  const agent = useAgentClient(
    () => createWSClient({ url: 'ws://localhost:8080' }),
    { disconnectOnUnmount: true }
  );

  useEffect(() => {
    agent?.registerTool({ name: 'greet', ... }, async (args) => `Hello ${args.name}`);
    void agent?.connect();
  }, []);

  return (
    <div>
      <button onClick={() => agent?.sendMessage('Say hello to World')}>Send</button>
      <p>Agent: {agent?.lastMessage}</p>
    </div>
  );
}
```

自动管理连接生命周期、重连、工具注册。消息前缀已由底层 client 处理，开发者无需关心。

---

## 13. 安全性

- **工具白名单**：服务端可根据 `name`、`domain` 等限制可注册的工具。
- **参数校验**：前后端双重校验 JSON Schema。
- **用户确认**：前端可为敏感工具弹出确认对话框。
- **会话隔离**：通过 `session_id` 严格隔离不同用户的工具和对话历史。
- **传输加密**：生产环境强制使用 WSS 和 HTTPS。
- **Redis 安全**：支持密码认证和 TLS 连接。
- **消息前缀**：`agent_remote:` 前缀防止协议消息被其他系统误处理。

---

## 14. 完整示例：使用 Express + SSE 的全栈应用

**服务端 (server.ts)**：
```typescript
import express from 'express';
import { AgentEngine, InMemoryStore, LocalBroker, SessionManager, OpenAILLMClient } from 'agent-remote-server-core';
import { createExpressAgentRouter } from 'agent-remote-server-express';

const engine = new AgentEngine({
  llmClient: new OpenAILLMClient({
    apiKey: process.env.OPENAI_API_KEY!,
    model: 'gpt-4.1-mini'
  }),
  sessionManager: new SessionManager(new InMemoryStore(), new LocalBroker())
});

const app = express();
app.use(express.json());
app.use(createExpressAgentRouter(engine));
app.listen(3000, () => console.log('Agent server running on port 3000'));
```

**前端 (client.ts)**：
```typescript
import { createSSEClient } from 'agent-remote-client/sse';

const client = createSSEClient({
  kind: 'sse',
  sseUrl: '/sse',
  postUrls: {
    registerTools: '/api/register_tools',
    sendMessage: '/api/chat',
    toolResult: '/api/tool_result'
  },
  sessionId: crypto.randomUUID()
});

client.registry.register({
  name: 'change_background',
  description: '更改页面背景颜色',
  parameters: {
    type: 'object',
    properties: { color: { type: 'string', description: 'CSS颜色值' } },
    required: ['color']
  },
  level: 'L1',
  domain: 'ui'
}, async (args) => {
  document.body.style.backgroundColor = args.color;
  return { previousColor: 'white' };
});

await client.connect();
client.on('message', text => alert(`Agent: ${text}`));
client.sendUserMessage('请把背景变成蓝色');
```

---

## 15. 总结

**agent-remote** 不是又一个浏览器自动化工具，而是一个**让任意 Web 应用向 AI Agent 标准化暴露功能的基础设施**。通过清晰的分层协议、带命名空间的安全消息格式、可插拔传输层、智能的工具检索机制和生产级多实例支持，它大幅降低了构建 AI 驱动 Web 应用的门槛，同时保留了极高的灵活性和扩展性。

随着 MCP 生态的发展，agent-remote 也将逐步提供 MCP 兼容层，使浏览器工具能被更多 MCP 客户端发现和调用，融入更广阔的 AI 工具生态。