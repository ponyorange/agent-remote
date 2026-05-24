# agent-remote-transport-sse

Language: English | [简体中文](README.zh-CN.md)

Browser-side SSE transport for Agent Remote. Server-to-client messages arrive through SSE, while client-to-server messages are sent through HTTP POST.

## Installation

```bash
npm install agent-remote-transport-sse agent-remote-core
```

You usually use it through `agent-remote-client/sse` instead of creating the transport directly.

## Basic Usage

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

## Configuration

- `kind`: Always `"sse"`.
- `sseUrl`: SSE endpoint, such as `/sse`.
- `sessionId`: Current browser session ID.
- `retryAttempts`: Retry attempts for failed POST requests, default `0`.
- `postUrls.registerTools`: POST URL for `agent_remote:register_tools`.
- `postUrls.sendMessage`: POST URL for `agent_remote:user_message`.
- `postUrls.toolResult`: POST URL for `agent_remote:tool_result`.

`createSseTransportConfig` checks that `sseUrl`, `sessionId`, and all three POST URLs are present.

## Send Behavior

SSE is a one-way downstream channel, so only these messages can be converted to POST requests by `send()`:

- `agent_remote:register_tools`: Body is `{ sessionId, tools }`.
- `agent_remote:user_message`: Body is `{ sessionId, text, messageId? }`.
- `agent_remote:tool_result`: Body is `{ sessionId, result }`.

Calling `send()` with other message types throws an error.

## Receive Behavior

The transport registers an SSE event listener for every type in `PROTOCOL_MESSAGE_TYPES`. Incoming event data is parsed as JSON and validated with `validateProtocolMessage`.

## Dependencies

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

- `createEventSource`: Custom EventSource factory, useful for tests.
- `fetch`: Custom fetch implementation.
- `onProtocolDrop`: Callback for malformed JSON or invalid protocol messages.

## Notes

- The transport automatically appends `sessionId` to the SSE URL as `session_id`.
- Default server routes are usually `/sse`, `/api/register_tools`, `/api/chat`, and `/api/tool_result`.
- Browser environments need `EventSource` and `fetch`.
