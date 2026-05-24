# @agent-remote/server-core

Framework-agnostic server primitives for Agent Remote.

## Key Exports

- `SessionManager`, `InMemoryStore`, `LocalBroker`
- `AgentEngine`, `LLMClient`, `OpenAILLMClient`
- `SessionAuth`, `ToolPolicy`, `AgentEngineObserver`

## Usage

```ts
import { AgentEngine, InMemoryStore, LocalBroker, SessionManager } from "@agent-remote/server-core";

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
```

Adapters call `handleRegisterTools`, `handleUserMessage`, and `handleToolResult`; transports attach through `sessionManager`.
