# agent-remote-example-express-sse-react

Language: English | [简体中文](README.zh-CN.md)

Private example project showing how to connect an Express server, SSE transport, React client, and Agent Remote browser tool calls.

## What It Shows

- The Express server creates an `AgentEngine` and `SessionManager`.
- The server exposes `/sse`, `/api/register_tools`, `/api/chat`, and `/api/tool_result` through `createExpressAgentRouter`.
- The React client connects through `createSSEClient`.
- The React component registers the `change_background` browser tool through `useAgentClient`.
- The demo LLM requests `change_background`, the browser executes it, and the tool result is returned.

## Run

Install dependencies and build from the repository root:

```bash
npm install -g @microsoft/rush@5.120.0
rush install
rush build
```

Run the example test:

```bash
rush test -t agent-remote-example-express-sse-react
```

Start the development server from the example package directory:

```bash
cd examples/express-sse-react
pnpm dev
```

The default port is `3000` and can be overridden with the `PORT` environment variable:

```bash
PORT=4000 pnpm dev
```

## Server Structure

`src/server.ts` creates the demo service:

- `DemoLLMClient`: Test LLM client. It returns a `change_background` tool call when it receives a user message, then returns `Background color updated.` after it receives a tool result.
- `SessionManager`: Uses `InMemoryStore` and `LocalBroker`, which is enough for a single-instance demo.
- `AgentEngine`: Connects the demo LLM and session manager.
- `createExpressAgentRouter`: Registers Agent Remote SSE and POST routes.
- `/health`: Simple health check endpoint.

## React Client Structure

`src/App.tsx` creates the browser-side demo:

- Uses `createSSEClient` to connect to `/sse`.
- Generates a random `sessionId` so every page instance has an isolated session.
- Uses `useAgentClient` to manage connection state, the last message, and cleanup.
- Registers the `change_background` tool with `{ color: string }` arguments.
- Calls `agent.sendMessage("Change the background to blue")` when the button is clicked.

## End-To-End Flow

1. The React component creates an SSE client.
2. The browser connects to `GET /sse?session_id=<id>`.
3. The client registers `change_background` through `POST /api/register_tools`.
4. The user clicks the button and the client sends a message to `POST /api/chat`.
5. `DemoLLMClient` returns an `agent_remote:tool_call`.
6. The server pushes the tool call to the browser through SSE.
7. The browser executes the tool and changes the page background color.
8. The client sends the result to `POST /api/tool_result`.
9. `DemoLLMClient` receives the tool result and returns assistant text.
10. The React page displays the last assistant message.

## What To Replace In Real Apps

- Replace `DemoLLMClient` with a real LLM client, such as `OpenAILLMClient`.
- Define real business tools and mark high-risk tools with `risk: "high"` or `level: "L3"`.
- Add `sessionAuth` to prevent unauthorized session connections and tool calls.
- For multi-instance deployments, replace `InMemoryStore` and `LocalBroker` with `agent-remote-server-redis`.

## Scripts

- `pnpm build`: Build server and React entries with tsup.
- `pnpm dev`: Run `src/server.ts` with tsx.
- `pnpm test`: Run Vitest.
- `pnpm lint`: Run `tsc --noEmit`.

## Notes

- This package is private and is not published to npm.
- The demo is intended for smoke tests and development reference; it does not include production authentication, persistence, or real LLM configuration.
