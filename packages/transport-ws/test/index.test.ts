import { describe, expect, it } from "vitest";
import { createWebSocketTransportConfig } from "../src/index";

describe("@agent-remote/transport-ws", () => {
  it("creates a websocket transport config with reconnect enabled by default", () => {
    expect(createWebSocketTransportConfig({ url: "ws://localhost:8080" })).toEqual({
      kind: "websocket",
      url: "ws://localhost:8080",
      reconnect: true
    });
  });

  it("requires a websocket url", () => {
    expect(() => createWebSocketTransportConfig({ url: "" })).toThrow(
      "WebSocket transport requires a url."
    );
  });
});
