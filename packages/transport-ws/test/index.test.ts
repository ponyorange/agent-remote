import { describe, expect, it } from "vitest";
import {
  createAssistantMessage,
  createUserMessage,
  type ProtocolMessage
} from "@agent-remote/core";
import {
  createWebSocketTransport,
  createWebSocketTransportConfig,
  type WebSocketLike
} from "../src/index";

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

  it("opens a WebSocket with the configured url", () => {
    const sockets: FakeWebSocket[] = [];

    createWebSocketTransport(createWebSocketTransportConfig({ url: "ws://localhost:8080" }), {
      createWebSocket(url) {
        const socket = new FakeWebSocket(url);
        sockets.push(socket);
        return socket;
      }
    });

    expect(sockets[0]?.url).toBe("ws://localhost:8080");
  });

  it("serializes protocol messages when sending", async () => {
    const socket = new FakeWebSocket("ws://localhost:8080");
    const transport = createWebSocketTransport(createWebSocketTransportConfig({ url: socket.url }), {
      createWebSocket: () => socket
    });

    await transport.send(createUserMessage("Hello"));

    expect(socket.sent).toEqual([
      JSON.stringify({
        type: "agent_remote:user_message",
        text: "Hello"
      })
    ]);
  });

  it("dispatches valid websocket messages to handlers", () => {
    const socket = new FakeWebSocket("ws://localhost:8080");
    const transport = createWebSocketTransport(createWebSocketTransportConfig({ url: socket.url }), {
      createWebSocket: () => socket
    });
    const received: unknown[] = [];
    const message = createAssistantMessage("Done");

    transport.onMessage((event) => received.push(event));
    socket.emitMessage(message);

    expect(received).toEqual([message]);
  });

  it("ignores messages that are not valid protocol messages", () => {
    const socket = new FakeWebSocket("ws://localhost:8080");
    const transport = createWebSocketTransport(createWebSocketTransportConfig({ url: socket.url }), {
      createWebSocket: () => socket
    });
    const received: unknown[] = [];

    transport.onMessage((event) => received.push(event));
    socket.emitRawMessage("{\"type\":\"chat_message\",\"text\":\"hello\"}");
    socket.emitRawMessage("not-json");

    expect(received).toEqual([]);
  });

  it("closes the WebSocket", async () => {
    const socket = new FakeWebSocket("ws://localhost:8080");
    const transport = createWebSocketTransport(createWebSocketTransportConfig({ url: socket.url }), {
      createWebSocket: () => socket
    });

    await transport.close();

    expect(socket.closed).toBe(true);
  });
});

class FakeWebSocket implements WebSocketLike {
  readonly sent: string[] = [];
  readonly listeners = new Map<string, Array<(event: MessageEvent<string>) => void>>();
  closed = false;

  constructor(readonly url: string) {}

  send(data: string): void {
    this.sent.push(data);
  }

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  close(): void {
    this.closed = true;
  }

  emitMessage(message: ProtocolMessage): void {
    this.emitRawMessage(JSON.stringify(message));
  }

  emitRawMessage(data: string): void {
    const event = { data } as MessageEvent<string>;

    for (const listener of this.listeners.get("message") ?? []) {
      listener(event);
    }
  }
}
