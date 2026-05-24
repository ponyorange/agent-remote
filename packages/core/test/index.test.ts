import { describe, expect, it } from "vitest";
import {
  AGENT_REMOTE_PROTOCOL_PREFIX,
  AGENT_REMOTE_PROTOCOL_VERSION,
  PROTOCOL_ERROR_CODES,
  createAssistantMessage,
  createErrorMessage,
  createHelloAckMessage,
  createHelloMessage,
  createRegisterToolsMessage,
  createToolCallMessage,
  createToolResultMessage,
  createUserMessage,
  isAgentRemoteMessage,
  normalizeToolDefinition,
  validateProtocolMessage,
  validateToolDefinition,
  type ProtocolMessage,
  type ToolDefinition
} from "../src/index";

describe("@agent-remote/core", () => {
  it("recognizes namespaced protocol messages", () => {
    expect(isAgentRemoteMessage({ type: "agent_remote:tool_call", callId: "call-1" })).toBe(true);
  });

  it("ignores application messages outside the agent_remote namespace", () => {
    expect(isAgentRemoteMessage({ type: "chat_message" })).toBe(false);
    expect(AGENT_REMOTE_PROTOCOL_PREFIX).toBe("agent_remote:");
  });

  it("allows tools to declare risk levels", () => {
    const tool: ToolDefinition = {
      name: "delete_record",
      description: "Delete a record",
      parameters: { type: "object" },
      risk: "high"
    };

    expect(tool.risk).toBe("high");
  });

  it("normalizes tool definitions with a default level", () => {
    expect(
      normalizeToolDefinition({
        name: "export_csv",
        description: "Export table data",
        parameters: { type: "object" },
        risk: "low"
      })
    ).toMatchObject({
      name: "export_csv",
      level: "L1",
      risk: "low"
    });
  });

  it("validates tool definition shape without validating JSON Schema semantics", () => {
    const valid = validateToolDefinition({
      name: "change_background_color",
      description: "Change the page background color",
      parameters: {
        type: "object",
        properties: {
          color: { type: "string" }
        },
        required: ["color"]
      },
      level: "L2",
      risk: "medium",
      domain: "ui",
      tags: ["style"]
    });

    expect(valid.ok).toBe(true);

    const semanticOnlySchema = validateToolDefinition({
      name: "semantic_only_schema",
      description: "Keep JSON Schema validation out of core",
      parameters: { type: "not-a-json-schema-type" }
    });

    expect(semanticOnlySchema.ok).toBe(true);

    const invalid = validateToolDefinition({
      name: "broken",
      description: "Broken tool",
      parameters: []
    });

    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.errors.some((error) => error.path === "/parameters")).toBe(true);
    }
  });

  it("creates typed protocol messages with the agent_remote namespace", () => {
    const messages: ProtocolMessage[] = [
      createHelloMessage(["sse", "tools"]),
      createHelloAckMessage(["sse"]),
      createRegisterToolsMessage([]),
      createToolCallMessage({ callId: "call-1", name: "export_csv", arguments: { format: "csv" } }),
      createToolResultMessage({ callId: "call-1", ok: true, result: { url: "/download.csv" } }),
      createUserMessage("Export this table"),
      createAssistantMessage("The export is ready"),
      createErrorMessage("Tool execution failed")
    ];

    expect(messages.map((message) => message.type)).toEqual([
      "agent_remote:hello",
      "agent_remote:hello_ack",
      "agent_remote:register_tools",
      "agent_remote:tool_call",
      "agent_remote:tool_result",
      "agent_remote:user_message",
      "agent_remote:assistant_message",
      "agent_remote:error"
    ]);
  });

  it("creates protocol handshake messages with version and capabilities", () => {
    expect(createHelloMessage(["sse", "tools"])).toEqual({
      type: "agent_remote:hello",
      protocolVersion: AGENT_REMOTE_PROTOCOL_VERSION,
      capabilities: ["sse", "tools"]
    });
    expect(createHelloAckMessage(["sse"])).toEqual({
      type: "agent_remote:hello_ack",
      protocolVersion: AGENT_REMOTE_PROTOCOL_VERSION,
      capabilities: ["sse"]
    });
    expect(PROTOCOL_ERROR_CODES.incompatibleProtocol).toBe("incompatible_protocol");
  });

  it("rejects protocol messages with incompatible protocol versions", () => {
    const result = validateProtocolMessage({
      type: "agent_remote:hello",
      protocolVersion: "9.9.9",
      capabilities: []
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual([
        expect.objectContaining({
          path: "/protocolVersion",
          message: "protocolVersion is not supported"
        })
      ]);
    }
  });

  it("normalizes tools when creating register_tools protocol messages", () => {
    expect(
      createRegisterToolsMessage([
        {
          name: "export_csv",
          description: "Export table data",
          parameters: { type: "object" }
        }
      ])
    ).toEqual({
      type: "agent_remote:register_tools",
      tools: [
        {
          name: "export_csv",
          description: "Export table data",
          parameters: { type: "object" },
          level: "L1"
        }
      ]
    });
  });

  it("validates known protocol messages and rejects unknown namespaced messages", () => {
    expect(validateProtocolMessage(createUserMessage("Hello")).ok).toBe(true);

    const invalid = validateProtocolMessage({
      type: "agent_remote:unknown",
      text: "Hello"
    });

    expect(invalid.ok).toBe(false);
  });
});
