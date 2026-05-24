# agent-remote-react

语言：[English](README.md) | 简体中文

`agent-remote-react` 提供 React hook 和状态管理辅助函数，用于在组件生命周期内管理 `BrowserAgentClient`。

## 安装

```bash
npm install agent-remote-react agent-remote-client
```

`react` 是 peer dependency，要求 `react >=18.0.0`。

## 适用场景

- 让 Agent Remote 连接跟随 React 组件挂载和卸载。
- 在组件中读取连接状态、最后一条 assistant 消息和错误。
- 在 React effect 中注册浏览器工具，并在组件卸载时清理。

## 基础用法

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

`createClient` 必须返回一个 `BrowserAgentClient`。为了避免重复创建连接，推荐用 `useCallback` 包装。

可选配置：

- `enabled`: 设为 `false` 时禁用客户端并返回 `null`。
- `autoConnect`: 设为 `true` 时 hook 会自动调用 `connect()`。
- `disconnectOnUnmount`: 组件卸载时调用 `disconnect()`。

返回状态：

- `client`: 底层 `BrowserAgentClient`。
- `status`: `idle`、`connecting`、`connected`、`disconnected` 或 `error`。
- `lastMessage`: 最近一条 assistant 文本消息。
- `error`: 最近一次错误。
- `connect()`: 连接服务端并注册工具。
- `disconnect()`: 断开连接。
- `sendMessage(text)`: 发送用户消息。
- `registerTool(definition, handler)`: 注册浏览器工具。
- `subscribe(listener)`: 订阅状态变化。
- `dispose()`: 清理客户端事件监听器。

## createAgentClientState

如果你需要在 React hook 之外测试或复用状态逻辑，可以直接使用 `createAgentClientState`。

```ts
import { createAgentClientState } from "agent-remote-react";

const state = createAgentClientState(client, { autoConnect: false });
state?.registerTool(definition, handler);
await state?.connect();
```

## 注意事项

- `useAgentClient` 会在 effect cleanup 中调用 `dispose()` 清理消息和错误订阅。
- 如果设置 `autoConnect: true`，请确保工具注册时机符合你的应用需求。
- `disconnectOnUnmount` 只在自动连接 effect 的 cleanup 中触发。
