# @agent-remote/transport-ws

Language: English | [简体中文](README.zh-CN.md)

WebSocket transport for Agent Remote browser clients and server-side WebSocket connections.

## Installation

```bash
npm install @agent-remote/transport-ws @agent-remote/core
```

You usually use it through the browser wrapper from `@agent-remote/client/ws`.

## Browser Usage

```ts
import { createWebSocketTransport, createWebSocketTransportConfig } from "@agent-remote/transport-ws";

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

## Server-Side Socket Wrapping

If your server framework already provides a WebSocket-like socket, wrap it with `createWebSocketServerTransport` to get a standard `TransportConnection`.

```ts
import { createWebSocketServerTransport } from "@agent-remote/transport-ws";

const transport = createWebSocketServerTransport(socket);
sessionManager.attachTransport("session-1", transport);
```

The socket must implement:

- `send(data: string)`: Send string data.
- `addEventListener(type, listener)`: Listen for `message`, `open`, and `close`.
- `close()`: Close the connection.
- `readyState`: Optional, used to detect whether the socket is open.

## Configuration

- `url`: WebSocket URL, required.
- `reconnect`: Whether to reconnect automatically, default `true`.
- `reconnectDelayMs`: Reconnect delay, default `250`.
- `maxReconnectAttempts`: Maximum reconnect attempts, default `5`.

`createWebSocketTransportConfig` validates that `url` is present and fills defaults.

## Sending And Reconnects

- The transport serializes protocol messages to JSON before sending them over WebSocket.
- If the socket is still connecting, sends are queued and flushed after `open`.
- If the connection closes and reconnect is enabled, the transport reconnects after the configured delay.
- After a successful reconnect, `onReconnect` fires so SDK clients can re-register tools.

## Dependencies

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

- `createWebSocket`: Custom WebSocket factory, useful for tests or non-browser environments.
- `scheduleReconnect`: Custom reconnect scheduler.
- `onProtocolDrop`: Callback for malformed JSON or invalid protocol messages.

## Notes

- The WebSocket transport supports handshakes and sets `supportsHandshake` to `true`.
- Browser environments need `globalThis.WebSocket` unless you provide `createWebSocket`.
- Invalid JSON or protocol validation failures are dropped and reported through `onProtocolDrop`.
