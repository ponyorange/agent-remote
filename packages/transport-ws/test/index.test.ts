import { describe, expect, it } from "vitest";
import {
  createAssistantMessage,
  createUserMessage,
  type ProtocolMessage
} from "agent-remote-core";
import {
  createWebSocketServerTransport,
  createWebSocketTransport,
  createWebSocketTransportConfig,
  type WebSocketLike
} from "../src/index";

describe("agent-remote-transport-ws", () => {
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

  it("queues messages until the WebSocket opens", async () => {
    const socket = new FakeWebSocket("ws://localhost:8080", 0);
    const transport = createWebSocketTransport(
      createWebSocketTransportConfig({ url: socket.url, reconnect: false }),
      {
      createWebSocket: () => socket
      }
    );
    const sendPromise = transport.send(createUserMessage("Hello"));

    expect(socket.sent).toEqual([]);

    socket.open();
    await sendPromise;

    expect(socket.sent).toEqual([
      JSON.stringify({
        type: "agent_remote:user_message",
        text: "Hello"
      })
    ]);
  });

  it("serializes protocol messages immediately when the WebSocket is open", async () => {
    const socket = new FakeWebSocket("ws://localhost:8080", 1);
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

  it("reconnects after close and sends through the new WebSocket", async () => {
    const sockets: FakeWebSocket[] = [];
    const transport = createWebSocketTransport(
      {
        kind: "websocket",
        url: "ws://localhost:8080",
        reconnect: true,
        reconnectDelayMs: 0,
        maxReconnectAttempts: 1
      },
      {
        createWebSocket(url) {
          const socket = new FakeWebSocket(url, 0);
          sockets.push(socket);
          return socket;
        },
        scheduleReconnect(reconnect) {
          reconnect();
        }
      }
    );

    sockets[0]?.close();
    expect(sockets).toHaveLength(2);

    const sendPromise = transport.send(createUserMessage("After reconnect"));
    sockets[1]?.open();
    await sendPromise;

    expect(sockets[1]?.sent).toEqual([
      JSON.stringify({
        type: "agent_remote:user_message",
        text: "After reconnect"
      })
    ]);
  });

  it("does not reconnect after the transport is closed", async () => {
    const sockets: FakeWebSocket[] = [];
    let reconnect: (() => void) | undefined;
    const transport = createWebSocketTransport(
      {
        kind: "websocket",
        url: "ws://localhost:8080",
        reconnect: true,
        reconnectDelayMs: 0,
        maxReconnectAttempts: 1
      },
      {
        createWebSocket(url) {
          const socket = new FakeWebSocket(url, 1);
          sockets.push(socket);
          return socket;
        },
        scheduleReconnect(nextReconnect) {
          reconnect = nextReconnect;
        }
      }
    );

    sockets[0]?.close();
    await transport.close();
    reconnect?.();

    expect(sockets).toHaveLength(1);
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
    const drops: unknown[] = [];
    const transport = createWebSocketTransport(createWebSocketTransportConfig({ url: socket.url }), {
      createWebSocket: () => socket,
      onProtocolDrop: (event) => drops.push(event)
    });
    const received: unknown[] = [];

    transport.onMessage((event) => received.push(event));
    socket.emitRawMessage("{\"type\":\"chat_message\",\"text\":\"hello\"}");
    socket.emitRawMessage("not-json");

    expect(received).toEqual([]);
    expect(drops).toEqual([
      expect.objectContaining({ reason: "invalid_protocol_message" }),
      expect.objectContaining({ reason: "malformed_json" })
    ]);
  });

  it("closes the WebSocket", async () => {
    const socket = new FakeWebSocket("ws://localhost:8080");
    const transport = createWebSocketTransport(createWebSocketTransportConfig({ url: socket.url }), {
      createWebSocket: () => socket
    });

    await transport.close();

    expect(socket.closed).toBe(true);
  });

  it("rejects queued sends when the WebSocket closes before opening", async () => {
    const socket = new FakeWebSocket("ws://localhost:8080", 0);
    const transport = createWebSocketTransport(createWebSocketTransportConfig({ url: socket.url }), {
      createWebSocket: () => socket
    });
    const sendPromise = transport.send(createUserMessage("Hello"));

    await transport.close();

    await expect(sendPromise).rejects.toThrow("WebSocket transport closed before opening.");
  });

  it("wraps an existing server WebSocket as a transport connection", async () => {
    const socket = new FakeWebSocket("server", 1);
    const transport = createWebSocketServerTransport(socket);
    const received: unknown[] = [];
    const message = createAssistantMessage("Done");

    transport.onMessage((event) => received.push(event));
    socket.emitMessage(message);
    await transport.send(createUserMessage("Ack"));

    expect(received).toEqual([message]);
    expect(socket.sent).toEqual([
      JSON.stringify({
        type: "agent_remote:user_message",
        text: "Ack"
      })
    ]);
  });
});

class FakeWebSocket implements WebSocketLike {
  readonly sent: string[] = [];
  readonly listeners = new Map<string, Array<(event: MessageEvent<string>) => void>>();
  closed = false;

  constructor(
    readonly url: string,
    public readyState = 1
  ) {}

  send(data: string): void {
    this.sent.push(data);
  }

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  close(): void {
    this.readyState = 3;
    this.closed = true;
    this.emitRawEvent("close", "");
  }

  open(): void {
    this.readyState = 1;
    this.emitRawEvent("open", "");
  }

  emitMessage(message: ProtocolMessage): void {
    this.emitRawMessage(JSON.stringify(message));
  }

  emitRawMessage(data: string): void {
    this.emitRawEvent("message", data);
  }

  private emitRawEvent(type: string, data: string): void {
    const event = { data } as MessageEvent<string>;

    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}
