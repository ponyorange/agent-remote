# agent-remote-react

Language: English | [简体中文](README.zh-CN.md)

React hooks and state helpers for managing a `BrowserAgentClient` inside the React component lifecycle.

## Installation

```bash
npm install agent-remote-react agent-remote-client
```

`react` is a peer dependency and must be `react >=18.0.0`.

## When To Use

- Keep the Agent Remote connection tied to React component mount and unmount.
- Read connection status, the last assistant message, and errors in component state.
- Register browser tools from React effects and clean up when the component unmounts.

## Basic Usage

```tsx
import { useCallback, useEffect } from "react";
import { createSSEClient } from "agent-remote-client/sse";
import { useAgentClient } from "agent-remote-react";

export function AgentWidget() {
  const createClient = useCallback(
    () =>
      createSSEClient({
        kind: "sse",
        sseUrl: "/sse",
        sessionId: crypto.randomUUID(),
        retryAttempts: 1,
        postUrls: {
          registerTools: "/api/register_tools",
          sendMessage: "/api/chat",
          toolResult: "/api/tool_result"
        }
      }),
    []
  );

  const agent = useAgentClient(createClient, {
    disconnectOnUnmount: true
  });

  useEffect(() => {
    agent?.registerTool(
      {
        name: "read_title",
        description: "Read the current document title.",
        parameters: { type: "object", properties: {} },
        risk: "low"
      },
      () => ({ title: document.title })
    );

    void agent?.connect();
  }, [agent]);

  return (
    <section>
      <p>Status: {agent?.status ?? "disabled"}</p>
      <p>Last message: {agent?.lastMessage ?? "None"}</p>
      <button type="button" onClick={() => void agent?.sendMessage("Read the title")}>
        Ask agent
      </button>
    </section>
  );
}
```

## useAgentClient

```ts
const agent = useAgentClient(createClient, options);
```

`createClient` must return a `BrowserAgentClient`. Wrap it with `useCallback` to avoid recreating connections.

Options:

- `enabled`: Set to `false` to disable the client and return `null`.
- `autoConnect`: Set to `true` to make the hook call `connect()` automatically.
- `disconnectOnUnmount`: Call `disconnect()` when the component unmounts.

Returned state:

- `client`: Underlying `BrowserAgentClient`.
- `status`: `idle`, `connecting`, `connected`, `disconnected`, or `error`.
- `lastMessage`: Most recent assistant text message.
- `error`: Most recent error.
- `connect()`: Connect to the server and register tools.
- `disconnect()`: Disconnect.
- `sendMessage(text)`: Send a user message.
- `registerTool(definition, handler)`: Register a browser tool.
- `subscribe(listener)`: Subscribe to state changes.
- `dispose()`: Clean up client event listeners.

## createAgentClientState

Use `createAgentClientState` directly if you need to test or reuse the state logic outside the React hook.

```ts
import { createAgentClientState } from "agent-remote-react";

const state = createAgentClientState(client, { autoConnect: false });
state?.registerTool(definition, handler);
await state?.connect();
```

## Notes

- `useAgentClient` calls `dispose()` during effect cleanup to remove message and error subscriptions.
- If `autoConnect: true` is enabled, make sure tool registration happens at the right time for your application.
- `disconnectOnUnmount` is applied in the auto-connect effect cleanup.
