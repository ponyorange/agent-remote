import { describe, expect, it } from "vitest";
import {
  BrowserAgentClient,
  type ToolHandler
} from "@agent-remote/client";
import {
  createAssistantMessage,
  createErrorMessage,
  type ProtocolMessage,
  type ToolDefinition,
  type TransportConnection
} from "@agent-remote/core";
import { createAgentClientState } from "../src/index";

describe("@agent-remote/react", () => {
  it("returns a client state when enabled", () => {
    const client = new BrowserAgentClient(new FakeTransport());

    const state = createAgentClientState(client);

    expect(state?.client).toBe(client);
    expect(state?.status).toBe("idle");
    expect(state?.lastMessage).toBeNull();
    expect(state?.error).toBeNull();
  });

  it("returns null when disabled", () => {
    expect(
      createAgentClientState(new BrowserAgentClient(new FakeTransport()), { enabled: false })
    ).toBeNull();
  });

  it("delegates connect, sendMessage, and disconnect to the client", async () => {
    const transport = new FakeTransport();
    const client = new BrowserAgentClient(transport);
    const state = createAgentClientState(client);

    await state?.connect();
    await state?.sendMessage("Make a chart");
    await state?.disconnect();

    expect(state?.status).toBe("disconnected");
    expect(transport.closed).toBe(true);
    expect(transport.sent).toEqual([
      {
        type: "agent_remote:register_tools",
        tools: []
      },
      {
        type: "agent_remote:user_message",
        text: "Make a chart"
      }
    ]);
  });

  it("registers tools through the client registry", () => {
    const client = new BrowserAgentClient(new FakeTransport());
    const state = createAgentClientState(client);
    const definition: ToolDefinition = {
      name: "echo",
      description: "Echo input",
      parameters: { type: "object" }
    };
    const handler: ToolHandler = (args) => args;

    state?.registerTool(definition, handler);

    expect(client.registry.getDefinitions()).toEqual([
      {
        ...definition,
        level: "L1"
      }
    ]);
  });

  it("updates lastMessage and notifies subscribers when the client receives a message", async () => {
    const transport = new FakeTransport();
    const client = new BrowserAgentClient(transport);
    const state = createAgentClientState(client);
    const snapshots: Array<string | null> = [];

    state?.subscribe(() => snapshots.push(state.lastMessage));
    await transport.emit(createAssistantMessage("Done"));

    expect(state?.lastMessage).toBe("Done");
    expect(snapshots).toEqual(["Done"]);
  });

  it("updates error and status when the client receives an error", async () => {
    const transport = new FakeTransport();
    const client = new BrowserAgentClient(transport);
    const state = createAgentClientState(client);

    await transport.emit(createErrorMessage("Tool failed", "tool_error"));

    expect(state?.status).toBe("error");
    expect(state?.error).toEqual({
      type: "agent_remote:error",
      message: "Tool failed",
      code: "tool_error"
    });
  });

  it("does not notify subscribers after unsubscribe", async () => {
    const transport = new FakeTransport();
    const client = new BrowserAgentClient(transport);
    const state = createAgentClientState(client);
    const snapshots: Array<string | null> = [];
    const unsubscribe = state?.subscribe(() => snapshots.push(state.lastMessage));

    unsubscribe?.();
    await transport.emit(createAssistantMessage("Done"));

    expect(state?.lastMessage).toBe("Done");
    expect(snapshots).toEqual([]);
  });

  it("disposes client event subscriptions", async () => {
    const transport = new FakeTransport();
    const client = new BrowserAgentClient(transport);
    const state = createAgentClientState(client);

    state?.dispose();
    await transport.emit(createAssistantMessage("Done"));

    expect(state?.lastMessage).toBeNull();
  });
});

class FakeTransport implements TransportConnection {
  readonly sent: ProtocolMessage[] = [];
  private readonly handlers: Array<(message: unknown) => void> = [];
  closed = false;

  async send(message: ProtocolMessage): Promise<void> {
    this.sent.push(message);
  }

  onMessage(handler: (message: unknown) => void): void {
    this.handlers.push(handler);
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  async emit(message: unknown): Promise<void> {
    for (const handler of this.handlers) {
      handler(message);
    }

    await Promise.resolve();
    await Promise.resolve();
  }
}
