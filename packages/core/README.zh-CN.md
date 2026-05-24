# agent-remote-core

语言：[English](README.md) | 简体中文

`agent-remote-core` 提供 Agent Remote 协议的共享类型、消息工厂、结构校验和传输层接口。所有浏览器端、服务端和传输层包都依赖它来保持同一套 `agent_remote:*` 协议。

## 安装

```bash
npm install agent-remote-core
```

## 适用场景

- 编写自定义 transport、服务端 adapter 或客户端封装。
- 创建或校验 `agent_remote:*` 协议消息。
- 复用 `ToolDefinition`、`ToolCall`、`ToolResult` 等公共类型。

## 关键导出

- `AGENT_REMOTE_PROTOCOL_VERSION`: 当前协议版本，当前值为 `0.1.0`。
- `PROTOCOL_MESSAGE_TYPES`: 标准 `agent_remote:*` 消息类型常量。
- `PROTOCOL_ERROR_CODES`: 标准错误码，例如 `incompatible_protocol` 和 `tool_execution_rejected`。
- `createHelloMessage`, `createHelloAckMessage`: WebSocket 握手消息工厂。
- `createRegisterToolsMessage`: 创建浏览器工具注册消息。
- `createToolCallMessage`, `createToolResultMessage`: 创建工具调用与工具结果消息。
- `createUserMessage`, `createAssistantMessage`, `createErrorMessage`: 创建用户、assistant 和错误消息。
- `validateProtocolMessage`: 校验协议消息结构。
- `validateToolDefinition`: 校验工具定义结构。
- `TransportConnection`: transport 需要实现的统一接口。
- `ToolDefinition`, `ToolCall`, `ToolResult`: 工具注册、调用和结果类型。

## 基础用法

```ts
import {
  createRegisterToolsMessage,
  createToolResultMessage,
  validateProtocolMessage,
  type ToolDefinition
} from "agent-remote-core";

const tools: ToolDefinition[] = [
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
  }
];

const registerTools = createRegisterToolsMessage(tools);
const validation = validateProtocolMessage(registerTools);

if (!validation.ok) {
  throw new Error(validation.errors.map((error) => error.message).join(", "));
}

const result = createToolResultMessage({
  callId: "call-1",
  ok: true,
  result: { color: "blue" }
});
```

## 协议类型

- `agent_remote:hello`: WebSocket 握手。
- `agent_remote:hello_ack`: WebSocket 握手确认。
- `agent_remote:register_tools`: 工具注册。
- `agent_remote:user_message`: 用户文本消息。
- `agent_remote:assistant_message`: assistant 文本消息。
- `agent_remote:tool_call`: 服务端请求浏览器执行工具。
- `agent_remote:tool_result`: 浏览器返回工具结果。
- `agent_remote:error`: 错误消息。

## ToolDefinition 字段

- `name`: 工具名称，必须是非空字符串。
- `description`: 给 LLM 和开发者看的工具说明。
- `parameters`: JSON Schema 风格的参数描述。
- `level`: 可选工具等级，`L1`、`L2` 或 `L3`。
- `risk`: 可选风险等级，`low`、`medium` 或 `high`。
- `domain`: 可选业务域，例如 `ui`、`document` 或 `billing`。
- `tags`: 可选标签列表，用于工具搜索。

## 注意事项

- 校验逻辑是轻量结构校验，不会验证 `parameters` 内部 JSON Schema 语义。
- `normalizeToolDefinition` 会在缺省时把 `level` 设置为 `L1`。
- 如果消息携带不兼容的 `protocolVersion`，`validateProtocolMessage` 会返回校验错误。
