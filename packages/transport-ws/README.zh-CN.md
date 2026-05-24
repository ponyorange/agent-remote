# agent-remote-transport-ws

语言：[English](README.md) | 简体中文

`agent-remote-transport-ws` 提供 WebSocket transport，用于 Agent Remote 浏览器客户端和服务端 WebSocket 连接。

## 安装

```bash
npm install agent-remote-transport-ws agent-remote-core
```

通常你会通过 `agent-remote-client/ws` 使用浏览器端封装。

## 浏览器端用法

```ts
import { createWebSocketTransport, createWebSocketTransportConfig } from "agent-remote-transport-ws";

const transport = createWebSocketTransport(createWebSocketTransportConfig({
  url: "ws://localhost:3000/agent",
  reconnect: true,
  reconnectDelayMs: 250,
  maxReconnectAttempts: 5
}));

transport.onMessage((message) => {
  console.log("Agent Remote message:", message);
});
```

## 服务端 socket 包装

如果服务端框架已经提供 WebSocket-like socket，可以用 `createWebSocketServerTransport` 包装成统一的 `TransportConnection`。

```ts
import { createWebSocketServerTransport } from "agent-remote-transport-ws";

const transport = createWebSocketServerTransport(socket);
sessionManager.attachTransport("session-1", transport);
```

socket 需要实现：

- `send(data: string)`: 发送字符串数据。
- `addEventListener(type, listener)`: 监听 `message`、`open` 和 `close`。
- `close()`: 关闭连接。
- `readyState`: 可选，用于判断是否已打开。

## 配置

- `url`: WebSocket URL，必填。
- `reconnect`: 是否自动重连，默认 `true`。
- `reconnectDelayMs`: 重连延迟，默认 `250`。
- `maxReconnectAttempts`: 最大重连次数，默认 `5`。

`createWebSocketTransportConfig` 会校验 `url` 是否存在，并补齐默认值。

## 发送与重连

- transport 会把协议消息序列化为 JSON 后通过 WebSocket 发送。
- 如果 socket 正在连接，发送请求会进入队列，并在 `open` 后 flush。
- 如果连接关闭且允许重连，transport 会按配置延迟重新连接。
- 重连成功后会触发 `onReconnect`，上层 SDK 可以重新注册工具。

## 依赖注入

```ts
const transport = createWebSocketTransport(config, {
  createWebSocket(url) {
    return new WebSocket(url);
  },
  scheduleReconnect(reconnect, delayMs) {
    return setTimeout(reconnect, delayMs);
  },
  onProtocolDrop(event) {
    console.warn("Dropped protocol payload", event);
  }
});
```

- `createWebSocket`: 自定义 WebSocket 创建函数，常用于测试或非浏览器环境。
- `scheduleReconnect`: 自定义重连调度。
- `onProtocolDrop`: malformed JSON 或无效协议消息回调。

## 注意事项

- WebSocket transport 支持握手，`supportsHandshake` 为 `true`。
- 浏览器环境需要 `globalThis.WebSocket`，除非你传入 `createWebSocket`。
- 无效 JSON 或协议校验失败的消息会被丢弃，并通过 `onProtocolDrop` 上报。
