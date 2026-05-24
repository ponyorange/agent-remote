# agent-remote-client

语言：[English](README.md) | 简体中文

`agent-remote-client` 是框架无关的浏览器 SDK，用于注册页面工具、连接 Agent Remote 服务端、发送用户消息，并执行服务端请求的工具调用。

## 安装

```bash
npm install agent-remote-client
```

如果你使用 React，通常会同时安装 `agent-remote-react`。

## 入口

- `agent-remote-client`: 导出 `BrowserAgentClient`、`ToolRegistry` 和核心客户端类型。
- `agent-remote-client/sse`: 导出 `createSSEClient` 和 `createSSEClientConfig`。
- `agent-remote-client/ws`: 导出 `createWSClient` 和 `createWSClientConfig`。

## SSE 用法

SSE client 使用 SSE 接收服务端消息，并用 HTTP POST 发送工具注册、用户消息和工具结果。

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
}, undefined, {
  async confirmToolCall(tool, call) {
    return window.confirm(`Allow ${tool.name} (${call.callId})?`);
  },
  onProtocolDrop(event) {
    console.warn("Dropped Agent Remote payload", event);
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

client.on("message", (message) => {
  console.log("Assistant:", message);
});

client.on("error", (error) => {
  console.error("Agent Remote error:", error);
});

await client.connect();
await client.sendUserMessage("Change the background to blue");
```

## WebSocket 用法

WebSocket 适合服务端和浏览器之间都可以保持双向连接的场景。

```ts
import { createWSClient } from "agent-remote-client/ws";

const client = createWSClient({
  url: "ws://localhost:3000/agent",
  reconnect: true,
  maxReconnectAttempts: 5
});

client.registry.register(
  {
    name: "read_title",
    description: "Read the current document title.",
    parameters: { type: "object", properties: {} },
    risk: "low"
  },
  () => ({ title: document.title })
);

await client.connect();
```

## BrowserAgentClient API

- `registry.register(definition, handler)`: 注册工具。
- `registry.unregister(name)`: 移除工具。
- `registry.getDefinitions()`: 读取当前工具定义列表。
- `connect()`: 发送握手和工具注册消息。
- `sendUserMessage(text)`: 发送用户消息。
- `on("message", handler)`: 订阅 assistant 文本消息。
- `on("error", handler)`: 订阅协议或执行错误。
- `disconnect()`: 关闭传输层并清理事件订阅。

## 安全与确认

- 当工具定义包含 `risk: "high"` 或 `level: "L3"` 时，客户端会调用 `confirmToolCall`。
- 如果 `confirmToolCall` 返回 `false`，客户端会返回失败的 `ToolResult`，并触发 `tool_execution_rejected` 错误。
- 相同 `callId` 的重复工具调用会复用已有结果，避免重复执行。

## 注意事项

- 本包面向浏览器环境；SSE 需要 `EventSource` 和 `fetch`，WebSocket 需要 `WebSocket`。
- SSE 模式会自动把 `sessionId` 加到 SSE URL 的 `session_id` 查询参数。
- WebSocket 重连成功后会重新调用 `connect()`，从而重新注册工具。
