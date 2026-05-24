# @agent-remote/server-node

Native Node.js HTTP router for Agent Remote.

## Usage

```ts
import http from "node:http";
import { createNodeAgentRouter } from "@agent-remote/server-node";

const server = http.createServer(createNodeAgentRouter(engine, {
  maxBodyBytes: 1024 * 1024,
  heartbeatIntervalMs: 30_000
}));

server.listen(3000);
```

Use `sessionAuth` to verify session tokens before SSE and POST requests are accepted.
