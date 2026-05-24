# @agent-remote/server-express

Express-compatible router for SSE receive streams and HTTP POST endpoints.

## Usage

```ts
import express from "express";
import { createExpressAgentRouter } from "@agent-remote/server-express";

const app = express();
app.use(express.json());
app.use(createExpressAgentRouter(engine, {
  sessionAuth: {
    verifySession({ token }) {
      return token === process.env.AGENT_REMOTE_SESSION_TOKEN;
    }
  }
}));
```

Default routes are `/sse`, `/api/register_tools`, `/api/chat`, and `/api/tool_result`.
