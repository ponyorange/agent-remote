# agent-remote

Language: English | [简体中文](README.zh-CN.md)

`agent-remote` is a Rush-managed TypeScript monorepo for exposing browser-side application tools to AI agents through transport-agnostic client and server SDKs.

## Use Cases

- Let AI agents call controlled tools inside a browser application, such as changing UI state, reading page state, or triggering app actions.
- Use one protocol for tool registration, user messages, tool calls, and tool results across multiple transports.
- Add Agent Remote routes to Express, Fastify, or native Node HTTP services.
- Use in-memory session state for single-instance services, or Redis-backed state and pub/sub for multi-instance deployments.

## Quickstart

This repository uses Rush + pnpm. Start by installing dependencies, building all packages, and running the demo smoke test:

```bash
npm install -g @microsoft/rush@5.120.0
rush install
rush build
rush test -t agent-remote-example-ai-designer-board
```

The flagship runnable demo lives in `examples/ai-designer-board`. It is an AI designer whiteboard: the browser registers canvas tools, the server-side agent thinks with DeepSeek or a scripted fallback, and the agent visibly creates, arranges, styles, undoes, and exports React Konva elements through Agent Remote.

## AI Designer Board Demo

Run the demo locally:

```bash
cd examples/ai-designer-board
rushx build
rushx dev
```

Open `http://localhost:3000`, then try prompts such as:

- "Place a blue circle in the middle of the canvas, 200px wide, and add Hello World text below it."
- "Distribute these elements evenly and add a dark blue to cyan gradient background."
- "Make the whole board minimalist and add a small progress chart."
- "Export the canvas as PNG."
- "Undo the last change."

For real LLM calls, set DeepSeek credentials before starting the server:

```bash
export DEEPSEEK_API_KEY=sk-...
rushx dev
```

If `DEEPSEEK_API_KEY` is not set, the demo automatically uses a scripted local LLM so anyone can run it without external credentials.

What to watch for:

- Browser-side tools: shapes, text, layout, gradients, charts, undo, export, and board state all run in the browser where the canvas lives.
- Server-side brain: API keys stay on the server, and the browser only receives controlled `agent_remote:tool_call` messages.
- Dynamic tools: advanced L2 tools are discovered with `search_tools` instead of always being sent to the model.
- Safety: high-risk tools such as export and clear require browser confirmation.
- Observability: the chat panel shows user messages, assistant replies, tool calls, tool results, loading state, and failures.
- Loop protection: the demo allows up to 50 tool-call rounds for rich design sessions, then stops runaway loops with an assistant message.

## Architecture

1. Browser applications create a client with `agent-remote-client` or `agent-remote-react`.
2. The client registers `ToolDefinition` objects and connects to the server through SSE or WebSocket.
3. Server adapters receive tool registrations, user messages, and tool results.
4. `agent-remote-server-core` manages sessions, LLM orchestration, tool policy, tool search, and outbound tool calls.
5. The browser executes the requested tool and returns a `ToolResult`, then the server continues the LLM loop.

## Protocol Messages

`agent-remote-core` defines protocol version `AGENT_REMOTE_PROTOCOL_VERSION = "0.1.0"`. All protocol message types use the `agent_remote:` prefix.

- `agent_remote:hello`: WebSocket handshake message.
- `agent_remote:hello_ack`: WebSocket handshake acknowledgement.
- `agent_remote:register_tools`: Browser tool registration.
- `agent_remote:user_message`: User text message sent to the agent.
- `agent_remote:assistant_message`: Assistant text returned to the browser.
- `agent_remote:tool_call`: Server request for browser tool execution.
- `agent_remote:tool_result`: Browser tool execution result.
- `agent_remote:error`: Protocol or execution error.

## Package Overview

Core protocol and types:

- `agent-remote-core`: Shared protocol types, message factories, structural validation, and transport contracts.

Browser side:

- `agent-remote-client`: Framework-agnostic browser SDK for tool registration, user messages, and server-requested tool calls.
- `agent-remote-react`: React hooks and state helpers for binding the Agent Remote client lifecycle to components.

Transports:

- `agent-remote-transport-sse`: Browser transport that receives server messages over SSE and sends client messages through HTTP POST.
- `agent-remote-transport-ws`: WebSocket transport with bidirectional messaging, reconnect support, and server-side socket wrapping.

Server side:

- `agent-remote-server-core`: Framework-agnostic server core with `AgentEngine`, `SessionManager`, in-memory storage, LLM interfaces, and an OpenAI-compatible client.
- `agent-remote-server-express`: Express router adapter for SSE and HTTP POST endpoints.
- `agent-remote-server-fastify`: Fastify plugin exposing the same Agent Remote endpoints.
- `agent-remote-server-node`: Native Node.js HTTP router for framework-free services.
- `agent-remote-server-redis`: Redis session store and message broker for multi-instance deployments.

Example:

- `agent-remote-example-ai-designer-board`: Private example project demonstrating an AI-controlled React Konva whiteboard with Express, SSE, DeepSeek-compatible LLM calls, browser tool confirmation, dynamic tool discovery, and PNG export.

## Package Selection

- Non-React browser app: install `agent-remote-client` and choose `agent-remote-client/sse` or `agent-remote-client/ws`.
- React app: install `agent-remote-react` and `agent-remote-client`, then use `useAgentClient` for connection state and cleanup.
- Express service: install `agent-remote-server-core` and `agent-remote-server-express`.
- Fastify service: install `agent-remote-server-core` and `agent-remote-server-fastify`.
- Native Node HTTP service: install `agent-remote-server-core` and `agent-remote-server-node`.
- Single-instance service: use `InMemoryStore` and `LocalBroker`.
- Multi-instance service: add `agent-remote-server-redis` for Redis-backed sessions and cross-instance messages.

## npm Package Usage

Install only the packages required by your runtime:

```bash
# Browser client with SSE or WebSocket helpers
npm install agent-remote-client

# React integration
npm install agent-remote-react agent-remote-client

# Express server adapter
npm install agent-remote-server-core agent-remote-server-express express

# Fastify server adapter
npm install agent-remote-server-core agent-remote-server-fastify fastify

# Native Node HTTP adapter
npm install agent-remote-server-core agent-remote-server-node

# Redis-backed multi-instance deployment
npm install agent-remote-server-redis redis
```

Import the package that matches your app layer:

```ts
import { createSSEClient } from "agent-remote-client/sse";
import { useAgentClient } from "agent-remote-react";
import { AgentEngine, SessionManager } from "agent-remote-server-core";
import { createExpressAgentRouter } from "agent-remote-server-express";
```

## Minimal Browser Client

```ts
import { createSSEClient } from "agent-remote-client/sse";

const client = createSSEClient({
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

client.registry.register(
  {
    name: "change_background",
    description: "Change the page background color.",
    parameters: {
      type: "object",
      properties: {
        color: { type: "string" }
      },
      required: ["color"]
    },
    risk: "low",
    domain: "ui",
    tags: ["demo"]
  },
  (args) => {
    const input = args as { color?: string };
    document.body.style.backgroundColor = input.color ?? "white";
    return { color: document.body.style.backgroundColor };
  }
);

await client.connect();
await client.sendUserMessage("Change the background to blue");
```

High-risk tools trigger confirmation: when a tool definition uses `risk: "high"` or `level: "L3"`, `BrowserAgentClient` calls `confirmToolCall`.

## Minimal Server

```ts
import express from "express";
import { AgentEngine, InMemoryStore, LocalBroker, SessionManager } from "agent-remote-server-core";
import { createExpressAgentRouter } from "agent-remote-server-express";

const sessionManager = new SessionManager(new InMemoryStore(), new LocalBroker());
const engine = new AgentEngine({
  llmClient,
  sessionManager,
  toolPolicy: {
    async filterTools(_sessionId, tools) {
      return tools.filter((tool) => tool.risk !== "high");
    }
  }
});

const app = express();
app.use(express.json());
app.use(createExpressAgentRouter(engine));
app.listen(3000);
```

Default routes:

- `GET /sse?session_id=<id>`: Open the SSE downstream channel.
- `POST /api/register_tools`: Register browser tools.
- `POST /api/chat`: Send a user message.
- `POST /api/tool_result`: Return a tool execution result.

## Session Authentication

Server adapters support `sessionAuth`. Tokens can be read from `Authorization: Bearer <token>`, query parameters `token` / `session_token`, or body fields `sessionToken` / `session_token`.

```ts
app.use(createExpressAgentRouter(engine, {
  sessionAuth: {
    async verifySession({ sessionId, token }) {
      return sessionId.length > 0 && token === process.env.AGENT_REMOTE_SESSION_TOKEN;
    }
  }
}));
```

## Development Commands

Install dependencies:

```bash
npm install -g @microsoft/rush@5.120.0
rush install
```

Build, test, and typecheck:

```bash
rush build
rush test
rush lint
```

Run one package:

```bash
rush build -t agent-remote-client
rush test -t agent-remote-example-ai-designer-board
rush lint -t agent-remote-server-core
```

`rush lint` currently runs each package's `tsc --noEmit` script. ESLint is not part of the default gate.

## Release Workflow

The repository defines Rush commands for Changesets:

```bash
rush changeset
rush version-packages
rush publish-packages
```

Public packages under `packages/*` set `publishConfig.access = "public"`. The example package `agent-remote-example-ai-designer-board` is private and is not published to npm.

## Compatibility

- Node.js: `>=18.18.0 <23.0.0`.
- Package manager: `pnpm@8.15.0` through Rush.
- Rush: `5.120.0`.
- TypeScript: `~5.4.5`.
- React integration: `react >=18.0.0`.
- Protocol version: `0.1.0`.

## License

MIT
