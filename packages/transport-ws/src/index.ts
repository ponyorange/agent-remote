import {
  validateProtocolMessage,
  type ProtocolDropEvent,
  type ProtocolMessage,
  type TransportConnection
} from "@agent-remote/core";

export interface WebSocketTransportConfig {
  kind: "websocket";
  url: string;
  reconnect: boolean;
  reconnectDelayMs?: number;
  maxReconnectAttempts?: number;
}

export interface WebSocketTransportOptions {
  url: string;
  reconnect?: boolean;
  reconnectDelayMs?: number;
  maxReconnectAttempts?: number;
}

export interface WebSocketLike {
  readonly readyState?: number;
  send(data: string): void;
  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void;
  close(): void;
}

export interface WebSocketTransportDependencies {
  createWebSocket?: (url: string) => WebSocketLike;
  scheduleReconnect?: (reconnect: () => void, delayMs: number) => unknown;
  onProtocolDrop?: (event: ProtocolDropEvent) => void;
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
    reconnect: options.reconnect ?? true,
    reconnectDelayMs: options.reconnectDelayMs,
    maxReconnectAttempts: options.maxReconnectAttempts
  };
}

export function createWebSocketTransport(
  config: WebSocketTransportConfig,
  dependencies: WebSocketTransportDependencies = {}
): TransportConnection {
  const normalizedConfig = createWebSocketTransportConfig(config);
  return createManagedWebSocketConnection(normalizedConfig, dependencies);
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
    supportsHandshake: true,
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

function createManagedWebSocketConnection(
  config: WebSocketTransportConfig,
  dependencies: WebSocketTransportDependencies
): TransportConnection {
  const handlers = new Set<(message: unknown) => void>();
  const reconnectHandlers = new Set<() => void>();
  const pendingSends: Array<{
    data: string;
    resolve: () => void;
    reject: (error: Error) => void;
  }> = [];
  let socket: WebSocketLike | null = null;
  let closed = false;
  let reconnectAttempts = 0;

  const connect = () => {
    if (closed) {
      return;
    }

    socket = createWebSocket(config.url, dependencies);
    const activeSocket = socket;

    activeSocket.addEventListener("message", (event) => {
      const message = parseIncomingMessage(event.data, dependencies.onProtocolDrop);

      if (!message) {
        return;
      }

      for (const handler of handlers) {
        handler(message);
      }
    });
    activeSocket.addEventListener("open", () => {
      const wasReconnect = reconnectAttempts > 0;
      reconnectAttempts = 0;
      flushPendingSends(activeSocket, pendingSends);
      if (wasReconnect) {
        for (const handler of reconnectHandlers) {
          handler();
        }
      }
    });
    activeSocket.addEventListener("close", () => {
      if (closed) {
        rejectPendingSends(pendingSends, new Error("WebSocket transport closed before opening."));
        return;
      }

      if (!config.reconnect || reconnectAttempts >= (config.maxReconnectAttempts ?? 5)) {
        closed = true;
        rejectPendingSends(pendingSends, new Error("WebSocket transport closed before opening."));
        return;
      }

      reconnectAttempts += 1;
      scheduleReconnect(dependencies, connect, config.reconnectDelayMs ?? 250);
    });
  };

  connect();

  return {
    supportsHandshake: true,
    send(message) {
      const data = JSON.stringify(message);

      if (closed) {
        return Promise.reject(new Error("WebSocket transport is closed."));
      }

      const activeSocket = socket;

      if (!activeSocket || activeSocket.readyState === undefined || activeSocket.readyState === WEB_SOCKET_OPEN) {
        activeSocket?.send(data);
        return Promise.resolve();
      }

      return new Promise<void>((resolve, reject) => {
        pendingSends.push({ data, resolve, reject });
      });
    },
    onMessage(handler) {
      handlers.add(handler);
    },
    onReconnect(handler) {
      reconnectHandlers.add(handler);
    },
    close() {
      closed = true;
      socket?.close();
      handlers.clear();
      reconnectHandlers.clear();
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

function parseIncomingMessage(
  data: string,
  onProtocolDrop?: (event: ProtocolDropEvent) => void
): ProtocolMessage | null {
  try {
    const parsed = JSON.parse(data) as unknown;
    const result = validateProtocolMessage(parsed);
    if (result.ok) {
      return result.value;
    }

    onProtocolDrop?.({ reason: "invalid_protocol_message", message: parsed, errors: result.errors });
    return null;
  } catch {
    onProtocolDrop?.({ reason: "malformed_json", message: data });
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

function scheduleReconnect(
  dependencies: WebSocketTransportDependencies,
  reconnect: () => void,
  delayMs: number
): void {
  if (dependencies.scheduleReconnect) {
    dependencies.scheduleReconnect(reconnect, delayMs);
    return;
  }

  globalThis.setTimeout(reconnect, delayMs);
}
