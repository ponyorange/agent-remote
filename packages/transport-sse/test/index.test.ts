import { describe, expect, it } from "vitest";
import { createSseTransportConfig } from "../src/index";

describe("@agent-remote/transport-sse", () => {
  it("creates an SSE transport config", () => {
    expect(
      createSseTransportConfig({
        kind: "sse",
        sseUrl: "/sse",
        sessionId: "session-1",
        postUrls: {
          registerTools: "/api/register_tools",
          sendMessage: "/api/chat",
          toolResult: "/api/tool_result"
        }
      })
    ).toMatchObject({
      kind: "sse",
      sseUrl: "/sse",
      sessionId: "session-1"
    });
  });

  it("requires a session id", () => {
    expect(() =>
      createSseTransportConfig({
        kind: "sse",
        sseUrl: "/sse",
        sessionId: "",
        postUrls: {
          registerTools: "/api/register_tools",
          sendMessage: "/api/chat",
          toolResult: "/api/tool_result"
        }
      })
    ).toThrow("SSE transport requires a sessionId.");
  });
});
