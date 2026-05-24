# agent-remote-server-node

Language: English | [简体中文](README.zh-CN.md)

Native Node.js HTTP router for exposing Agent Remote SSE and HTTP POST endpoints without Express or Fastify.

## Installation

```bash
npm install agent-remote-server-node agent-remote-server-core
```

## Basic Usage

```ts
import http from "node:http";
import { AgentEngine, InMemoryStore, LocalBroker, SessionManager } from "agent-remote-server-core";
import { createNodeAgentRouter } from "agent-remote-server-node";

const sessionManager = new SessionManager(new InMemoryStore(), new LocalBroker());
const engine = new AgentEngine({
  llmClient,
  sessionManager
});

const server = http.createServer(createNodeAgentRouter(engine, {
  maxBodyBytes: 1024 * 1024,
  heartbeatIntervalMs: 30_000
}));

server.listen(3000);
```

## Default Routes

- `GET /sse?session_id=<id>`: Open an SSE connection.
- `POST /api/register_tools`: Register tools.
- `POST /api/chat`: Send a user message.
- `POST /api/tool_result`: Return a tool result.

Unmatched requests return a `404` JSON response.

## Custom Routes

```ts
const router = createNodeAgentRouter(engine, {
  routes: {
    sse: "/agent/sse",
    registerTools: "/agent/register-tools",
    chat: "/agent/chat",
    toolResult: "/agent/tool-result"
  }
});

const server = http.createServer(router);
```

## Session Authentication

```ts
const router = createNodeAgentRouter(engine, {
  sessionAuth: {
    async verifySession({ sessionId, token }) {
      return sessionId.length > 0 && token === process.env.AGENT_REMOTE_SESSION_TOKEN;
    }
  }
});
```

Token sources:

- `Authorization: Bearer <token>`
- Query parameter `token` or `session_token`
- Body field `sessionToken` or `session_token`

## Options

- `routes`: Override default routes.
- `maxBodyBytes`: Maximum POST body size in bytes, default `1024 * 1024`.
- `sessionAuth`: Verify sessions before accepting SSE and POST requests.
- `heartbeatIntervalMs`: SSE heartbeat interval, default `30_000`.

## Request Requirements

- SSE requests must include a `session_id` or `sessionId` query parameter.
- POST bodies must be JSON objects and include `sessionId` or `session_id`.
- POST requests larger than `maxBodyBytes` return `413`.
- Invalid JSON returns `400`.
- If the engine does not expose `sessionManager`, the SSE route returns `501`.

## Notes

- SSE uses `ServerResponse.writeHead()` to set `text/event-stream` response headers.
- On client disconnect, the router clears the heartbeat and detaches the transport.
- This package is useful for minimal services, edge adapters, or custom framework integrations.
