# agent-remote

`@agent-remote` is a Rush-managed TypeScript monorepo for exposing browser-side
application tools to AI agents through transport-agnostic client and server SDKs.

## Quickstart

```bash
npm install -g @microsoft/rush@5.120.0
rush install
rush build
rush test -t @agent-remote/example-express-sse-react
```

The runnable demo lives in `examples/express-sse-react`. It uses the published package
entry points, opens an SSE stream, registers a low-risk browser tool, and verifies that
the server can stream an `agent_remote:tool_call`.

## Architecture

Browser apps register tools through `@agent-remote/client` or `@agent-remote/react`.
Server adapters (`server-node`, `server-express`, `server-fastify`) receive tool
registrations and user messages, while `@agent-remote/server-core` manages sessions,
LLM orchestration, tool policy, and outbound tool calls. Transports are swappable:
`transport-ws` provides bidirectional WebSocket support and `transport-sse` provides
SSE receive plus HTTP POST send.

## Packages

- `@agent-remote/core`: shared protocol types and transport contracts.
- `@agent-remote/transport-ws`: WebSocket transport package.
- `@agent-remote/transport-sse`: SSE and HTTP transport package.
- `@agent-remote/client`: browser SDK for tool registration and agent messaging.
- `@agent-remote/server-core`: framework-agnostic server primitives.
- `@agent-remote/server-express`: Express adapter.
- `@agent-remote/server-fastify`: Fastify adapter.
- `@agent-remote/server-node`: Node HTTP adapter.
- `@agent-remote/server-redis`: Redis integration package.
- `@agent-remote/react`: React integration helpers.
- `@agent-remote/example-express-sse-react`: private smoke-tested example project.

## Package Selection

- Use `@agent-remote/client` when you are not using React.
- Use `@agent-remote/react` when tool registration and lifecycle should follow React components.
- Use `@agent-remote/server-core` with one server adapter for a single-instance service.
- Add `@agent-remote/server-redis` when session state and message routing must span multiple instances.

## Compatibility

- Runtime: Node.js `>=18.18.0 <23.0.0`.
- Protocol: `AGENT_REMOTE_PROTOCOL_VERSION` is `0.1.0`; new messages carry optional `protocolVersion`, `traceId`, and capabilities metadata.
- React integration: `react` is a peer dependency and is tested with React 18.
- `rush lint` currently runs each package's `tsc --noEmit`; ESLint is not part of the default gate.

## Development

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

`rush lint` currently runs each package's `tsc --noEmit` script.
