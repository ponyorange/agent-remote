# @agent-remote/core

Language: English | [简体中文](README.zh-CN.md)

Shared protocol types, message factories, structural validators, and transport contracts for Agent Remote. All browser, server, and transport packages depend on this package so they speak the same `agent_remote:*` protocol.

## Installation

```bash
npm install @agent-remote/core
```

## When To Use

- Build a custom transport, server adapter, or client wrapper.
- Create or validate `agent_remote:*` protocol messages.
- Reuse shared types such as `ToolDefinition`, `ToolCall`, and `ToolResult`.

## Key Exports

- `AGENT_REMOTE_PROTOCOL_VERSION`: Current protocol version, currently `0.1.0`.
- `PROTOCOL_MESSAGE_TYPES`: Standard `agent_remote:*` message type constants.
- `PROTOCOL_ERROR_CODES`: Standard error codes such as `incompatible_protocol` and `tool_execution_rejected`.
- `createHelloMessage`, `createHelloAckMessage`: WebSocket handshake message factories.
- `createRegisterToolsMessage`: Creates a browser tool registration message.
- `createToolCallMessage`, `createToolResultMessage`: Create tool call and tool result messages.
- `createUserMessage`, `createAssistantMessage`, `createErrorMessage`: Create user, assistant, and error messages.
- `validateProtocolMessage`: Validates protocol message structure.
- `validateToolDefinition`: Validates tool definition structure.
- `TransportConnection`: Common interface implemented by transports.
- `ToolDefinition`, `ToolCall`, `ToolResult`: Core tool registration, call, and result types.

## Basic Usage

```ts
import {
  createRegisterToolsMessage,
  createToolResultMessage,
  validateProtocolMessage,
  type ToolDefinition
} from "@agent-remote/core";

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

## Protocol Types

- `agent_remote:hello`: WebSocket handshake.
- `agent_remote:hello_ack`: WebSocket handshake acknowledgement.
- `agent_remote:register_tools`: Browser tool registration.
- `agent_remote:user_message`: User text message.
- `agent_remote:assistant_message`: Assistant text message.
- `agent_remote:tool_call`: Server request for browser tool execution.
- `agent_remote:tool_result`: Browser tool result.
- `agent_remote:error`: Error message.

## ToolDefinition Fields

- `name`: Tool name, required non-empty string.
- `description`: Description shown to the LLM and developers.
- `parameters`: JSON Schema-like parameter description.
- `level`: Optional tool level: `L1`, `L2`, or `L3`.
- `risk`: Optional risk level: `low`, `medium`, or `high`.
- `domain`: Optional domain such as `ui`, `document`, or `billing`.
- `tags`: Optional tags used by tool search.

## Notes

- Validation is intentionally structural and lightweight. It does not validate JSON Schema semantics inside `parameters`.
- `normalizeToolDefinition` defaults missing `level` values to `L1`.
- If a message carries an incompatible `protocolVersion`, `validateProtocolMessage` returns a validation error.
