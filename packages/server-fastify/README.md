# agent-remote-server-fastify

Language: English | [简体中文](README.zh-CN.md)

Fastify plugin that registers Agent Remote SSE and HTTP POST routes.

## Installation

```bash
npm install agent-remote-server-fastify agent-remote-server-core fastify
```

`fastify` is a peer dependency and must be `fastify >=4.0.0`.

## Basic Usage

```ts
import Fastify from "fastify";
import { AgentEngine, InMemoryStore, LocalBroker, SessionManager } from "agent-remote-server-core";
import { createFastifyAgentPlugin } from "agent-remote-server-fastify";

const fastify = Fastify();
const sessionManager = new SessionManager(new InMemoryStore(), new LocalBroker());
const engine = new AgentEngine({
  llmClient,
  sessionManager
});

await fastify.register(createFastifyAgentPlugin(engine, {
  heartbeatIntervalMs: 30_000
}));

await fastify.listen({ port: 3000 });
```

## Default Routes

- `GET /sse?session_id=<id>`: Open an SSE connection.
- `POST /api/register_tools`: Register browser tools.
- `POST /api/chat`: Send a user message.
- `POST /api/tool_result`: Return a tool execution result.

## Custom Routes

```ts
await fastify.register(createFastifyAgentPlugin(engine, {
  routes: {
    sse: "/agent/sse",
    registerTools: "/agent/register-tools",
    chat: "/agent/chat",
    toolResult: "/agent/tool-result"
  }
}));
```

The browser SSE client URLs need to match the custom routes.

## Session Authentication

```ts
await fastify.register(createFastifyAgentPlugin(engine, {
  sessionAuth: {
    async verifySession({ sessionId, token }) {
      return sessionId.length > 0 && token === process.env.AGENT_REMOTE_SESSION_TOKEN;
    }
  }
}));
```

Token sources:

- `Authorization: Bearer <token>`
- Query parameter `token` or `session_token`
- Body field `sessionToken` or `session_token`

## Options

- `routes`: Override default routes.
- `sessionAuth`: Verify sessions before SSE and POST requests.
- `heartbeatIntervalMs`: SSE heartbeat interval, default `30_000`.

## Request Requirements

- SSE requests must include a `session_id` or `sessionId` query parameter.
- POST bodies must be JSON objects and include `sessionId` or `session_id`.
- The Fastify reply must expose `reply.raw` because SSE uses the underlying raw stream.
- If the engine does not expose `sessionManager`, the SSE route returns `501`.

## Notes

- The plugin calls `reply.hijack?.()` for SSE responses.
- On client disconnect, the plugin clears the heartbeat and detaches the transport.
- Route handlers convert known request errors to JSON error responses.
