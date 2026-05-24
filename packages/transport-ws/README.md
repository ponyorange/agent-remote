# @agent-remote/transport-ws

WebSocket transport for Agent Remote clients and server-side WebSocket connections.

## Usage

```ts
import { createWebSocketTransport, createWebSocketTransportConfig } from "@agent-remote/transport-ws";

const transport = createWebSocketTransport(createWebSocketTransportConfig({
  url: "ws://localhost:3000/agent",
  reconnect: true,
  maxReconnectAttempts: 5
}));
```

The client transport queues sends while connecting and emits `onReconnect` so SDK clients can re-register tools.
