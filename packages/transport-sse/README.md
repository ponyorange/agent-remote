# @agent-remote/transport-sse

SSE receive plus HTTP POST send transport for browser clients.

## Usage

```ts
import { createSseTransport } from "@agent-remote/transport-sse";

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
```

Only client-to-server messages are sent through POST. Server-to-client messages arrive as SSE events.
