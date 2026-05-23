export interface WebSocketTransportConfig {
  kind: "websocket";
  url: string;
  reconnect: boolean;
}

export interface WebSocketTransportOptions {
  url: string;
  reconnect?: boolean;
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
