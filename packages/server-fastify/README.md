# @agent-remote/server-fastify

Fastify plugin for Agent Remote SSE and HTTP POST routes.

## Usage

```ts
import { createFastifyAgentPlugin } from "@agent-remote/server-fastify";

await fastify.register(createFastifyAgentPlugin(engine, {
  heartbeatIntervalMs: 30_000
}));
```

The plugin registers `/sse`, `/api/register_tools`, `/api/chat`, and `/api/tool_result` by default.
