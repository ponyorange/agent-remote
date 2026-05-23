# agent-remote

`@agent-remote` is a Rush-managed TypeScript monorepo for exposing browser-side
application tools to AI agents through transport-agnostic client and server SDKs.

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

## Development

Install dependencies:

```bash
npm install -g @microsoft/rush@5.120.0
rush install
```

Build, test, and lint:

```bash
rush build
rush test
rush lint
```
