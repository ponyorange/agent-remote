# agent-remote-server-express

Language: English | [简体中文](README.zh-CN.md)

Express-compatible router for Agent Remote's SSE downstream channel and HTTP POST upstream endpoints.

## Installation

```bash
npm install agent-remote-server-express agent-remote-server-core express
```

`express` is a peer dependency and must be `express >=4.18.0`.

## Basic Usage

```ts
import express from "express";
import { AgentEngine, InMemoryStore, LocalBroker, SessionManager } from "agent-remote-server-core";
import { createExpressAgentRouter } from "agent-remote-server-express";

const sessionManager = new SessionManager(new InMemoryStore(), new LocalBroker());
const engine = new AgentEngine({
  llmClient,
  sessionManager
});

const app = express();
app.use(express.json());
app.use(createExpressAgentRouter(engine));
app.listen(3000);
```

## Default Routes

- `GET /sse?session_id=<id>`: Open an SSE connection and attach the transport to `sessionId`.
- `POST /api/register_tools`: Receive `{ sessionId, tools }` and register browser tools.
- `POST /api/chat`: Receive `{ sessionId, text, messageId? }` and send a user message.
- `POST /api/tool_result`: Receive `{ sessionId, result }` or direct tool result fields.

## Custom Routes

```ts
app.use(createExpressAgentRouter(engine, {
  routes: {
    sse: "/agent/sse",
    registerTools: "/agent/register-tools",
    chat: "/agent/chat",
    toolResult: "/agent/tool-result"
  }
}));
```

The browser SSE client's `postUrls` must match these routes.

## Session Authentication

```ts
app.use(createExpressAgentRouter(engine, {
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
- `sessionAuth`: Verify sessions before accepting SSE and POST requests.
- `heartbeatIntervalMs`: SSE heartbeat interval, default `30_000`.

## Request Requirements

- POST requests need an Express JSON body parser, such as `app.use(express.json())`.
- SSE requests must include a `session_id` or `sessionId` query parameter.
- POST bodies must include `sessionId` or `session_id`.
- If the engine does not expose `sessionManager`, the SSE route returns `501`.

## Notes

- SSE responses set `content-type: text/event-stream`, `cache-control: no-cache, no-transform`, and `x-accel-buffering: no`.
- When the client disconnects, the router detaches the corresponding transport.
- Unmatched requests call `next()`, so the router can be composed with other Express routes.
