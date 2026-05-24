import { describe, expect, it, vi } from "vitest";
import {
  createAssistantMessage,
  createErrorMessage,
  createToolCallMessage,
  type ProtocolMessage,
  type TransportConnection
} from "@agent-remote/core";
import { createSSEClient } from "../src/sse";
import { createWSClient } from "../src/ws";
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

  it("normalizes registered tool definitions", () => {
    const registry = new ToolRegistry();
    registry.register(
      {
        name: "echo",
        description: "Echo an input value",
        parameters: { type: "object" }
      },
      (args) => args
    );

    expect(registry.getDefinitions()).toEqual([
      {
        name: "echo",
        description: "Echo an input value",
        parameters: { type: "object" },
        level: "L1"
      }
    ]);
  });

  it("returns a tool result error when a handler throws", async () => {
    const registry = new ToolRegistry();
    registry.register(
      {
        name: "fail",
        description: "Fail intentionally",
        parameters: { type: "object" }
      },
      () => {
        throw new Error("boom");
      }
    );

    await expect(
      registry.execute({ callId: "call-1", name: "fail", arguments: {} })
    ).resolves.toEqual({
      callId: "call-1",
      ok: false,
      error: "boom"
    });
  });

  it("sends registered tool definitions when connecting", async () => {
    const transport = new FakeTransport();
    const client = new BrowserAgentClient(transport);

    client.registry.register(
      {
        name: "change_background_color",
        description: "Change background color",
        parameters: { type: "object" }
      },
      () => undefined
    );
    await client.connect();

    expect(transport.sent).toEqual([{
      type: "agent_remote:register_tools",
      tools: [
        {
          name: "change_background_color",
          description: "Change background color",
          parameters: { type: "object" },
          level: "L1"
        }
      ]
    }]);
  });

  it("sends user messages through the transport", async () => {
    const transport = new FakeTransport();
    const client = new BrowserAgentClient(transport);

    await client.sendUserMessage("Create a chart");

    expect(transport.sent).toEqual([
      {
        type: "agent_remote:user_message",
        text: "Create a chart"
      }
    ]);
  });

  it("executes tool calls and sends tool results", async () => {
    const transport = new FakeTransport();
    const client = new BrowserAgentClient(transport);
    client.registry.register(
      {
        name: "sum",
        description: "Sum numbers",
        parameters: { type: "object" }
      },
      (args) => {
        const input = args as { left: number; right: number };
        return input.left + input.right;
      }
    );

    await transport.emit(
      createToolCallMessage({
        callId: "call-1",
        name: "sum",
        arguments: { left: 2, right: 3 }
      })
    );

    expect(transport.sent).toEqual([
      {
        type: "agent_remote:tool_result",
        callId: "call-1",
        ok: true,
        result: 5
      }
    ]);
  });

  it("emits assistant messages and protocol errors", async () => {
    const transport = new FakeTransport();
    const client = new BrowserAgentClient(transport);
    const messages: string[] = [];
    const errors: string[] = [];
    client.on("message", (text) => messages.push(text));
    client.on("error", (error) => errors.push(error.message));

    await transport.emit(createAssistantMessage("All set"));
    await transport.emit(createErrorMessage("Tool failed", "tool_error"));

    expect(messages).toEqual(["All set"]);
    expect(errors).toEqual(["Tool failed"]);
  });

  it("unsubscribes client event handlers", async () => {
    const transport = new FakeTransport();
    const client = new BrowserAgentClient(transport);
    const messages: string[] = [];
    const unsubscribe = client.on("message", (text) => messages.push(text));

    unsubscribe();
    await transport.emit(createAssistantMessage("All set"));

    expect(messages).toEqual([]);
  });

  it("ignores messages that are not valid agent-remote protocol messages", async () => {
    const transport = new FakeTransport();
    const client = new BrowserAgentClient(transport);
    const messages: string[] = [];
    client.on("message", (text) => messages.push(text));

    await transport.emit({ type: "chat_message", text: "hello" });

    expect(messages).toEqual([]);
  });

  it("closes the transport when disconnecting", async () => {
    const transport = new FakeTransport();
    const client = new BrowserAgentClient(transport);

    await client.disconnect();

    expect(transport.closed).toBe(true);
  });

  it("creates an SSE-backed browser client", async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    const client = createSSEClient(
      {
        kind: "sse",
        sseUrl: "/sse",
        sessionId: "session-1",
        postUrls: {
          registerTools: "/api/register_tools",
          sendMessage: "/api/chat",
          toolResult: "/api/tool_result"
        }
      },
      {
        createEventSource: () => new FakeEventSource(),
        fetch: async (url, init) => {
          requests.push({
            url,
            body: JSON.parse(String(init?.body))
          });
          return new Response(null, { status: 204 });
        }
      }
    );

    client.registry.register(
      {
        name: "echo",
        description: "Echo input",
        parameters: { type: "object" }
      },
      (args) => args
    );
    await client.connect();

    expect(requests).toEqual([
      {
        url: "/api/register_tools",
        body: {
          sessionId: "session-1",
          tools: [
            {
              name: "echo",
              description: "Echo input",
              parameters: { type: "object" },
              level: "L1"
            }
          ]
        }
      }
    ]);
  });

  it("creates a WebSocket-backed browser client", async () => {
    const socket = new FakeWebSocket("ws://localhost:8080");
    const client = createWSClient(
      { url: "ws://localhost:8080", reconnect: false },
      { createWebSocket: () => socket }
    );

    await client.sendUserMessage("Hello");

    expect(socket.sent).toEqual([
      JSON.stringify({
        type: "agent_remote:user_message",
        text: "Hello"
      })
    ]);
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

class FakeEventSource {
  addEventListener(): void {}
  close(): void {}
}

class FakeWebSocket {
  readonly sent: string[] = [];
  readonly readyState = 1;

  constructor(readonly url: string) {}

  send(data: string): void {
    this.sent.push(data);
  }

  addEventListener(): void {}
  close(): void {}
}
