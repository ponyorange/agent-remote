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
  readonly readyState?: number;
  send(data: string): void;
  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void;
  close(): void;
}

export interface WebSocketTransportDependencies {
  createWebSocket?: (url: string) => WebSocketLike;
}

const WEB_SOCKET_OPEN = 1;

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
  const socket = createWebSocket(normalizedConfig.url, dependencies);

  return createWebSocketConnection(socket);
}

export function createWebSocketServerTransport(socket: WebSocketLike): TransportConnection {
  return createWebSocketConnection(socket);
}

function createWebSocketConnection(socket: WebSocketLike): TransportConnection {
  const handlers = new Set<(message: unknown) => void>();
  const pendingSends: Array<{
    data: string;
    resolve: () => void;
    reject: (error: Error) => void;
  }> = [];
  let closed = false;

  socket.addEventListener("message", (event) => {
    const message = parseIncomingMessage(event.data);

    if (!message) {
      return;
    }

    for (const handler of handlers) {
      handler(message);
    }
  });
  socket.addEventListener("open", () => {
    flushPendingSends(socket, pendingSends);
  });
  socket.addEventListener("close", () => {
    closed = true;
    rejectPendingSends(pendingSends, new Error("WebSocket transport closed before opening."));
  });

  return {
    send(message) {
      const data = JSON.stringify(message);

      if (closed) {
        return Promise.reject(new Error("WebSocket transport is closed."));
      }

      if (socket.readyState === undefined || socket.readyState === WEB_SOCKET_OPEN) {
        socket.send(data);
        return Promise.resolve();
      }

      return new Promise<void>((resolve, reject) => {
        pendingSends.push({ data, resolve, reject });
      });
    },
    onMessage(handler) {
      handlers.add(handler);
    },
    close() {
      closed = true;
      socket.close();
      handlers.clear();
      rejectPendingSends(pendingSends, new Error("WebSocket transport closed before opening."));
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

function flushPendingSends(
  socket: WebSocketLike,
  pendingSends: Array<{ data: string; resolve: () => void; reject: (error: Error) => void }>
): void {
  for (const pending of pendingSends.splice(0)) {
    socket.send(pending.data);
    pending.resolve();
  }
}

function rejectPendingSends(
  pendingSends: Array<{ data: string; resolve: () => void; reject: (error: Error) => void }>,
  error: Error
): void {
  for (const pending of pendingSends.splice(0)) {
    pending.reject(error);
  }
}
