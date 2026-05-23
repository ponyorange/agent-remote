import { describe, expect, it, vi } from "vitest";
import { BrowserAgentClient, ToolRegistry } from "../src/index";

describe("@agent-remote/client", () => {
  it("registers and executes browser tools", async () => {
    const registry = new ToolRegistry();
    registry.register(
      {
        name: "echo",
        description: "Echo an input value",
        parameters: { type: "object" }
      },
      (args) => args
    );

    await expect(
      registry.execute({ callId: "call-1", name: "echo", arguments: { text: "hello" } })
    ).resolves.toEqual({
      callId: "call-1",
      ok: true,
      result: { text: "hello" }
    });
  });

  it("sends registered tool definitions when connecting", () => {
    const send = vi.fn();
    const client = new BrowserAgentClient({
      send,
      onMessage: vi.fn(),
      close: vi.fn()
    });

    client.registry.register(
      {
        name: "change_background_color",
        description: "Change background color",
        parameters: { type: "object" }
      },
      () => undefined
    );
    client.connect();

    expect(send).toHaveBeenCalledWith({
      type: "agent_remote:register_tools",
      tools: [
        {
          name: "change_background_color",
          description: "Change background color",
          parameters: { type: "object" }
        }
      ]
    });
  });
});
