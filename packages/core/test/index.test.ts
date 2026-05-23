import { describe, expect, it } from "vitest";
import {
  AGENT_REMOTE_PROTOCOL_PREFIX,
  isAgentRemoteMessage,
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
});
