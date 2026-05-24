# agent-remote-server-core

Language: English | [简体中文](README.zh-CN.md)

Framework-agnostic server primitives for Agent Remote: session management, message brokering, LLM orchestration, tool policy, tool search, and an OpenAI-compatible client.

## Installation

```bash
npm install agent-remote-server-core
```

Server applications usually also need one adapter:

```bash
npm install agent-remote-server-express
# or
npm install agent-remote-server-fastify
# or
npm install agent-remote-server-node
```

## When To Use

- Create an Agent Remote server engine.
- Manage browser sessions, registered tools, and message history.
- Plug in a custom LLM or use an OpenAI-compatible API.
- Filter high-risk tools or observe LLM requests and tool calls on the server.

## Key Exports

- `AgentEngine`: Core orchestrator for tool registration, user messages, and tool results.
- `SessionManager`: Manages session data and attached transports.
- `InMemoryStore`: In-memory session store for single-instance services.
- `LocalBroker`: Local message broker for single-instance services.
- `LLMClient`: Interface for custom LLM clients.
- `OpenAILLMClient`: OpenAI Chat Completions compatible client.
- `SessionAuth`: Session authentication interface used by server adapters.
- `ToolPolicy`: Tool filtering policy interface.
- `AgentEngineObserver`: Observer interface for LLM requests, responses, tool calls, and protocol drops.

## Basic Usage

```ts
import {
  AgentEngine,
  InMemoryStore,
  LocalBroker,
  SessionManager,
  type LLMClient
} from "agent-remote-server-core";

const llmClient: LLMClient = {
  async chat(request) {
    const tool = request.tools.find((candidate) => candidate.name === "read_title");

    if (tool) {
      return {
        toolCalls: [
          {
            callId: "call-read-title",
            name: tool.name,
            arguments: {}
          }
        ]
      };
    }

    return { text: "No browser tool is available." };
  }
};

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

Adapters call:

- `engine.handleRegisterTools(sessionId, tools)`: Save tools available to the current session.
- `engine.handleUserMessage(sessionId, text, messageId)`: Append a user message and run the LLM.
- `engine.handleToolResult(sessionId, result)`: Append a tool result and continue the LLM loop.

## OpenAI-Compatible Client

```ts
import { OpenAILLMClient } from "agent-remote-server-core";

const llmClient = new OpenAILLMClient({
  apiKey: process.env.OPENAI_API_KEY!,
  model: "gpt-4.1-mini"
});
```

Optional `baseUrl` supports OpenAI-compatible gateways or private deployments. Optional `fetch` is useful for tests or custom networking.

## Tool Search

`AgentEngine` directly exposes only `level: "L1"` tools to the LLM and automatically adds an internal `search_tools` tool. The LLM can call `search_tools` to search registered tools by name, description, domain, or tags.

## Sessions And Multi-Instance Deployments

- Single-instance services can use `InMemoryStore` and `LocalBroker`.
- Multi-instance services should use `RedisSessionStore` and `RedisMessageBroker` from `agent-remote-server-redis`.
- `SessionManager.attachTransport()` binds an SSE or WebSocket connection to a session.
- `SessionManager.sendToSession()` sends to local connections and publishes through the broker for other instances.

## Notes

- `messageId` deduplicates user messages; repeated IDs do not trigger the LLM again.
- `ToolResult.callId` deduplicates tool results.
- `OpenAILLMClient` uses Chat Completions-style `tools` and `tool_calls`.
