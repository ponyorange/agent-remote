# agent-remote-transport-sse

语言：[English](README.md) | 简体中文

`agent-remote-transport-sse` 提供浏览器端 SSE transport：服务端到客户端的消息通过 SSE 到达，客户端到服务端的消息通过 HTTP POST 发送。

## 安装

```bash
npm install agent-remote-transport-sse agent-remote-core
```

通常你会通过 `agent-remote-client/sse` 使用它，而不是直接创建 transport。

## 基础用法

```ts
import { createSseTransport } from "agent-remote-transport-sse";

const transport = createSseTransport({
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

transport.onMessage((message) => {
  console.log("Agent Remote message:", message);
});
```

## 配置

- `kind`: 固定为 `"sse"`。
- `sseUrl`: SSE endpoint，例如 `/sse`。
- `sessionId`: 当前浏览器会话 ID。
- `retryAttempts`: POST 失败后的重试次数，默认 `0`。
- `postUrls.registerTools`: 发送 `agent_remote:register_tools` 的 POST URL。
- `postUrls.sendMessage`: 发送 `agent_remote:user_message` 的 POST URL。
- `postUrls.toolResult`: 发送 `agent_remote:tool_result` 的 POST URL。

`createSseTransportConfig` 会检查 `sseUrl`、`sessionId` 和三个 POST URL 是否存在。

## 发送行为

SSE 是单向下行通道，因此只有以下消息可以通过 `send()` 转成 POST 请求：

- `agent_remote:register_tools`: body 为 `{ sessionId, tools }`。
- `agent_remote:user_message`: body 为 `{ sessionId, text, messageId? }`。
- `agent_remote:tool_result`: body 为 `{ sessionId, result }`。

其他消息类型调用 `send()` 会抛出错误。

## 接收行为

transport 会为 `PROTOCOL_MESSAGE_TYPES` 中的每个消息类型注册 SSE event listener。收到事件后会解析 JSON，并用 `validateProtocolMessage` 校验。

## 依赖注入

```ts
const transport = createSseTransport(config, {
  createEventSource(url) {
    return new EventSource(url);
  },
  fetch(url, init) {
    return fetch(url, init);
  },
  onProtocolDrop(event) {
    console.warn("Dropped protocol payload", event);
  }
});
```

- `createEventSource`: 自定义 EventSource 创建函数，常用于测试。
- `fetch`: 自定义 fetch 实现。
- `onProtocolDrop`: malformed JSON 或无效协议消息回调。

## 注意事项

- transport 会把 `sessionId` 自动追加到 SSE URL 的 `session_id` 查询参数。
- 服务端默认路由通常是 `/sse`、`/api/register_tools`、`/api/chat` 和 `/api/tool_result`。
- 浏览器环境需要 `EventSource` 和 `fetch`。
