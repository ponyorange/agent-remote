# @agent-remote/client

Language: English | [简体中文](README.zh-CN.md)

Framework-agnostic browser SDK for registering page tools, connecting to an Agent Remote server, sending user messages, and executing server-requested tool calls.

## Installation

```bash
npm install @agent-remote/client
```

If you use React, install `@agent-remote/react` as well.

## Entry Points

- `@agent-remote/client`: Exports `BrowserAgentClient`, `ToolRegistry`, and core client types.
- `@agent-remote/client/sse`: Exports `createSSEClient` and `createSSEClientConfig`.
- `@agent-remote/client/ws`: Exports `createWSClient` and `createWSClientConfig`.

## SSE Usage

The SSE client receives server messages through SSE and sends tool registrations, user messages, and tool results through HTTP POST.

```ts
import { createSSEClient } from "@agent-remote/client/sse";

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

## WebSocket Usage

Use WebSocket when the browser and server can keep a bidirectional connection open.

```ts
import { createWSClient } from "@agent-remote/client/ws";

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

- `registry.register(definition, handler)`: Register a tool.
- `registry.unregister(name)`: Unregister a tool.
- `registry.getDefinitions()`: Read current tool definitions.
- `connect()`: Send handshake and tool registration messages.
- `sendUserMessage(text)`: Send a user message.
- `on("message", handler)`: Subscribe to assistant text messages.
- `on("error", handler)`: Subscribe to protocol or execution errors.
- `disconnect()`: Close the transport and clear event handlers.

## Safety And Confirmation

- When a tool definition uses `risk: "high"` or `level: "L3"`, the client calls `confirmToolCall`.
- If `confirmToolCall` returns `false`, the client returns a failed `ToolResult` and emits a `tool_execution_rejected` error.
- Duplicate tool calls with the same `callId` reuse the existing result to avoid repeated execution.

## Notes

- This package targets browser environments. SSE needs `EventSource` and `fetch`; WebSocket needs `WebSocket`.
- SSE mode appends `sessionId` to the SSE URL as the `session_id` query parameter.
- After WebSocket reconnect, the client calls `connect()` again and re-registers tools.
