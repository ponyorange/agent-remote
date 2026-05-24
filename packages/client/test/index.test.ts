import { describe, expect, it, vi } from "vitest";
import {
  createAssistantMessage,
  createErrorMessage,
  createToolCallMessage,
  type ProtocolMessage,
  type TransportConnection
} from "agent-remote-core";
import { createSSEClient } from "../src/sse";
import { createWSClient } from "../src/ws";
import { BrowserAgentClient, ToolRegistry } from "../src/index";

describe("agent-remote-client", () => {
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

  it("sends hello before registering tools when the transport supports handshake", async () => {
    const transport = new FakeTransport();
    transport.supportsHandshake = true;
    const client = new BrowserAgentClient(transport);

    await client.connect();

    expect(transport.sent).toEqual([
      {
        type: "agent_remote:hello",
        protocolVersion: "0.1.0",
        capabilities: ["tools"]
      },
      {
        type: "agent_remote:register_tools",
        tools: []
      }
    ]);
  });

  it("re-registers tools after transport reconnects", async () => {
    const transport = new FakeTransport();
    const client = new BrowserAgentClient(transport);
    client.registry.register(
      {
        name: "echo",
        description: "Echo input",
        parameters: { type: "object" }
      },
      (args) => args
    );

    await client.connect();
    transport.sent.splice(0);
    transport.emitReconnect();

    await Promise.resolve();
    expect(transport.sent).toEqual([
      {
        type: "agent_remote:register_tools",
        tools: [
          {
            name: "echo",
            description: "Echo input",
            parameters: { type: "object" },
            level: "L1"
          }
        ]
      }
    ]);
  });

  it("sends user messages through the transport", async () => {
    const transport = new FakeTransport();
    const client = new BrowserAgentClient(transport);

    await client.sendUserMessage("Create a chart");

    expect(transport.sent).toEqual([
      {
        type: "agent_remote:user_message",
        text: "Create a chart",
        messageId: expect.any(String)
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

  it("re-sends cached tool results for duplicate tool calls by callId", async () => {
    const transport = new FakeTransport();
    const client = new BrowserAgentClient(transport);
    const handler = vi.fn(() => "ok");
    client.registry.register(
      {
        name: "echo",
        description: "Echo",
        parameters: { type: "object" }
      },
      handler
    );
    const call = createToolCallMessage({
      callId: "call-1",
      name: "echo",
      arguments: {}
    });

    await transport.emit(call);
    await transport.emit(call);

    expect(handler).toHaveBeenCalledOnce();
    expect(transport.sent).toEqual([
      {
        type: "agent_remote:tool_result",
        callId: "call-1",
        ok: true,
        result: "ok"
      },
      {
        type: "agent_remote:tool_result",
        callId: "call-1",
        ok: true,
        result: "ok"
      }
    ]);
  });

  it("asks for confirmation before executing high-risk tools", async () => {
    const transport = new FakeTransport();
    const handler = vi.fn();
    const client = new BrowserAgentClient(transport, {
      confirmToolCall: async () => false
    });
    client.registry.register(
      {
        name: "delete_record",
        description: "Delete a record",
        parameters: { type: "object" },
        risk: "high"
      },
      handler
    );

    await transport.emit(
      createToolCallMessage({
        callId: "call-1",
        name: "delete_record",
        arguments: { id: "record-1" }
      })
    );

    expect(handler).not.toHaveBeenCalled();
    expect(transport.sent).toEqual([
      {
        type: "agent_remote:tool_result",
        callId: "call-1",
        ok: false,
        error: "Tool execution rejected by confirmation."
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

  it("emits incompatible protocol errors for unsupported protocol versions", async () => {
    const transport = new FakeTransport();
    const client = new BrowserAgentClient(transport);
    const errors: string[] = [];
    client.on("error", (error) => errors.push(`${error.code}:${error.message}`));

    await transport.emit({
      type: "agent_remote:hello_ack",
      protocolVersion: "9.9.9",
      capabilities: []
    });

    expect(errors).toEqual(["incompatible_protocol:Incompatible Agent Remote protocol version."]);
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

  it("reports invalid protocol messages through the protocol drop hook", async () => {
    const transport = new FakeTransport();
    const drops: unknown[] = [];
    new BrowserAgentClient(transport, {
      onProtocolDrop(message) {
        drops.push(message);
      }
    });

    await transport.emit({ type: "chat_message", text: "hello" });

    expect(drops).toEqual([
      expect.objectContaining({
        reason: "invalid_protocol_message",
        message: { type: "chat_message", text: "hello" }
      })
    ]);
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

  it("passes browser client options through createSSEClient", async () => {
    const source = new FakeEventSource();
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
        createEventSource: () => source,
        fetch: async (url, init) => {
          requests.push({
            url,
            body: JSON.parse(String(init?.body))
          });
          return new Response(null, { status: 204 });
        }
      },
      {
        confirmToolCall: async () => true
      }
    );
    client.registry.register(
      {
        name: "dangerous",
        description: "Dangerous action",
        parameters: { type: "object" },
        risk: "high"
      },
      () => "confirmed"
    );

    await source.emit(
      createToolCallMessage({ callId: "call-1", name: "dangerous", arguments: {} })
    );
    await flushAsync();

    expect(requests).toEqual([
      {
        url: "/api/tool_result",
        body: {
          sessionId: "session-1",
          result: {
            type: "agent_remote:tool_result",
            callId: "call-1",
            ok: true,
            result: "confirmed"
          }
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

    expect(socket.sent.map((message) => JSON.parse(message))).toEqual([
      {
        type: "agent_remote:user_message",
        text: "Hello",
        messageId: expect.any(String)
      }
    ]);
  });

  it("passes browser client options through createWSClient", async () => {
    const socket = new FakeWebSocket("ws://localhost:8080");
    const client = createWSClient(
      { url: "ws://localhost:8080", reconnect: false },
      { createWebSocket: () => socket },
      { confirmToolCall: async () => true }
    );
    client.registry.register(
      {
        name: "dangerous",
        description: "Dangerous action",
        parameters: { type: "object" },
        risk: "high"
      },
      () => "confirmed"
    );

    socket.emit(createToolCallMessage({ callId: "call-1", name: "dangerous", arguments: {} }));
    await flushAsync();

    expect(socket.sent.map((message) => JSON.parse(message))).toEqual([
      {
        type: "agent_remote:tool_result",
        callId: "call-1",
        ok: true,
        result: "confirmed"
      }
    ]);
  });
});

class FakeTransport implements TransportConnection {
  readonly sent: ProtocolMessage[] = [];
  private readonly handlers: Array<(message: unknown) => void> = [];
  private readonly reconnectHandlers: Array<() => void> = [];
  supportsHandshake = false;
  closed = false;

  async send(message: ProtocolMessage): Promise<void> {
    this.sent.push(message);
  }

  onMessage(handler: (message: unknown) => void): void {
    this.handlers.push(handler);
  }

  onReconnect(handler: () => void): void {
    this.reconnectHandlers.push(handler);
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

  emitReconnect(): void {
    for (const handler of this.reconnectHandlers) {
      handler();
    }
  }
}

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

class FakeEventSource {
  private readonly listeners = new Map<string, Array<(event: MessageEvent<string>) => void>>();

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  close(): void {}

  async emit(message: ProtocolMessage): Promise<void> {
    const event = { data: JSON.stringify(message) } as MessageEvent<string>;
    for (const listener of this.listeners.get(message.type) ?? []) {
      listener(event);
    }

    await Promise.resolve();
    await Promise.resolve();
  }
}

class FakeWebSocket {
  readonly sent: string[] = [];
  readonly readyState = 1;
  private readonly listeners = new Map<string, Array<(event: MessageEvent<string>) => void>>();

  constructor(readonly url: string) {}

  send(data: string): void {
    this.sent.push(data);
  }

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  close(): void {}

  emit(message: ProtocolMessage): void {
    const event = { data: JSON.stringify(message) } as MessageEvent<string>;
    for (const listener of this.listeners.get("message") ?? []) {
      listener(event);
    }
  }
}
