# @agent-remote/core

Shared protocol types, message factories, validation helpers, and transport contracts.

## Key Exports

- `PROTOCOL_MESSAGE_TYPES`, `AGENT_REMOTE_PROTOCOL_VERSION`, `PROTOCOL_ERROR_CODES`
- `createHelloMessage`, `createHelloAckMessage`, `createRegisterToolsMessage`, `createToolCallMessage`, `createToolResultMessage`
- `validateProtocolMessage`, `validateToolDefinition`
- `TransportConnection`, `ToolDefinition`, `ToolCall`, `ToolResult`

## Notes

Validation is intentionally structural and lightweight. It does not validate JSON Schema semantics for tool parameters.
