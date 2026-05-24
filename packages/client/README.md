# @agent-remote/client

Browser SDK for registering tools, sending user messages, and executing server-requested tool calls.

## Usage

```ts
import { BrowserAgentClient } from "@agent-remote/client";
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
  { name: "change_background", description: "Change background", parameters: { type: "object" }, risk: "low" },
  (args) => args
);

await client.connect();
await client.sendUserMessage("Change the background");
```

## Notes

High-risk tools (`risk: "high"` or `level: "L3"`) can be gated with `confirmToolCall`. Duplicate `callId`s are ignored.
