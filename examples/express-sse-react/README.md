# Express SSE React Example

Runnable demo for `@agent-remote` using Express, SSE + HTTP, and React.

## Run

```bash
node ../../common/scripts/install-run-rush.js install
pnpm --dir ../../common/temp exec rushx dev
```

The server listens on `http://localhost:3000` and exposes:

- `GET /sse?session_id=<id>` for server-to-client events
- `POST /api/register_tools`
- `POST /api/chat`
- `POST /api/tool_result`

## Smoke Test

```bash
node ../../common/scripts/install-run-rush.js test -t @agent-remote/example-express-sse-react
```

The smoke test opens an SSE stream, registers a browser tool, posts a user message, and verifies that the server streams an `agent_remote:tool_call`.
