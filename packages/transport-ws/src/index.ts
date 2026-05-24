import {
  validateProtocolMessage,
  type ProtocolMessage,
  type TransportConnection
} from "@agent-remote/core";

export interface WebSocketTransportConfig {
  kind: "websocket";
  url: string;
  reconnect: boolean;
}

export interface WebSocketTransportOptions {
  url: string;
  reconnect?: boolean;
}

export interface WebSocketLike {
  send(data: string): void;
  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void;
  close(): void;
}

export interface WebSocketTransportDependencies {
  createWebSocket?: (url: string) => WebSocketLike;
}

export function createWebSocketTransportConfig(
  options: WebSocketTransportOptions
): WebSocketTransportConfig {
  if (!options.url) {
    throw new Error("WebSocket transport requires a url.");
  }

  return {
    kind: "websocket",
    url: options.url,
    reconnect: options.reconnect ?? true
  };
}

export function createWebSocketTransport(
  config: WebSocketTransportConfig,
  dependencies: WebSocketTransportDependencies = {}
): TransportConnection {
  const normalizedConfig = createWebSocketTransportConfig(config);
  const handlers = new Set<(message: unknown) => void>();
  const socket = createWebSocket(normalizedConfig.url, dependencies);

  socket.addEventListener("message", (event) => {
    const message = parseIncomingMessage(event.data);

    if (!message) {
      return;
    }

    for (const handler of handlers) {
      handler(message);
    }
  });

  return {
    send(message) {
      socket.send(JSON.stringify(message));
    },
    onMessage(handler) {
      handlers.add(handler);
    },
    close() {
      socket.close();
      handlers.clear();
    }
  };
}

function createWebSocket(
  url: string,
  dependencies: WebSocketTransportDependencies
): WebSocketLike {
  if (dependencies.createWebSocket) {
    return dependencies.createWebSocket(url);
  }

  if (!globalThis.WebSocket) {
    throw new Error("WebSocket transport requires WebSocket.");
  }

  return new globalThis.WebSocket(url);
}

function parseIncomingMessage(data: string): ProtocolMessage | null {
  try {
    const parsed = JSON.parse(data) as unknown;
    const result = validateProtocolMessage(parsed);
    return result.ok ? result.value : null;
  } catch {
    return null;
  }
}
