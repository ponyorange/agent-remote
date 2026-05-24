# agent-remote-server-core

语言：[English](README.md) | 简体中文

`agent-remote-server-core` 提供框架无关的服务端核心能力：会话管理、消息分发、LLM 编排、工具策略、工具搜索和 OpenAI 兼容客户端。

## 安装

```bash
npm install agent-remote-server-core
```

服务端通常还需要一个 adapter：

```bash
npm install agent-remote-server-express
# 或
npm install agent-remote-server-fastify
# 或
npm install agent-remote-server-node
```

## 适用场景

- 创建 Agent Remote 服务端引擎。
- 管理浏览器会话、注册工具和消息历史。
- 接入自定义 LLM，或使用 OpenAI 兼容 API。
- 在服务端过滤高风险工具或观测 LLM 请求和工具调用。

## 关键导出

- `AgentEngine`: 核心编排器，处理工具注册、用户消息和工具结果。
- `SessionManager`: 管理会话数据和已连接 transport。
- `InMemoryStore`: 单实例内存会话存储。
- `LocalBroker`: 单实例本地消息 broker。
- `LLMClient`: 自定义 LLM 客户端接口。
- `OpenAILLMClient`: OpenAI Chat Completions 兼容客户端。
- `SessionAuth`: 服务端 adapter 使用的会话认证接口。
- `ToolPolicy`: 工具过滤策略接口。
- `AgentEngineObserver`: LLM 请求、响应、工具调用和协议丢弃事件的观测接口。

## 基础用法

```ts
import {
  AgentEngine,
  InMemoryStore,
  LocalBroker,
  SessionManager,
  type LLMClient
} from "agent-remote-server-core";

const llmClient: LLMClient = {
  async chat(request) {
    const tool = request.tools.find((candidate) => candidate.name === "read_title");

    if (tool) {
      return {
        toolCalls: [
          {
            callId: "call-read-title",
            name: tool.name,
            arguments: {}
          }
        ]
      };
    }

    return { text: "No browser tool is available." };
  }
};

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
```

Adapter 会调用：

- `engine.handleRegisterTools(sessionId, tools)`: 保存当前会话可用工具。
- `engine.handleUserMessage(sessionId, text, messageId)`: 追加用户消息并运行 LLM。
- `engine.handleToolResult(sessionId, result)`: 追加工具结果并继续 LLM 回合。

## OpenAI 兼容客户端

```ts
import { OpenAILLMClient } from "agent-remote-server-core";

const llmClient = new OpenAILLMClient({
  apiKey: process.env.OPENAI_API_KEY!,
  model: "gpt-4.1-mini"
});
```

可选 `baseUrl` 支持 OpenAI 兼容网关或私有部署；可选 `fetch` 便于测试或自定义网络层。

## 工具搜索

`AgentEngine` 只直接暴露 `level: "L1"` 的工具给 LLM，并自动加入内部 `search_tools` 工具。LLM 可以通过 `search_tools` 按名称、描述、domain 或 tags 搜索更多已注册工具。

## 会话与多实例

- 单实例服务可以直接使用 `InMemoryStore` 和 `LocalBroker`。
- 多实例服务应使用 `agent-remote-server-redis` 提供的 `RedisSessionStore` 和 `RedisMessageBroker`。
- `SessionManager.attachTransport()` 用于把 SSE 或 WebSocket 连接绑定到会话。
- `SessionManager.sendToSession()` 会向本实例连接发送消息，并通过 broker 发布给其他实例。

## 注意事项

- `messageId` 用于用户消息去重；重复 `messageId` 不会再次触发 LLM。
- `ToolResult.callId` 用于工具结果去重；重复结果不会再次触发 LLM。
- `OpenAILLMClient` 使用 Chat Completions 风格的 `tools` 和 `tool_calls`。
