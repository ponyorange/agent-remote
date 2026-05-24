import {
  createWebSocketTransport,
  createWebSocketTransportConfig,
  type WebSocketTransportDependencies,
  type WebSocketTransportOptions
} from "@agent-remote/transport-ws";
import { BrowserAgentClient, type BrowserAgentClientOptions } from "./index";

export { createWebSocketTransportConfig as createWSClientConfig };

export function createWSClient(
  options: WebSocketTransportOptions,
  dependencies?: WebSocketTransportDependencies,
  clientOptions?: BrowserAgentClientOptions
): BrowserAgentClient {
  return new BrowserAgentClient(
    createWebSocketTransport(createWebSocketTransportConfig(options), dependencies),
    clientOptions
  );
}
