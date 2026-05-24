import {
  createWebSocketTransport,
  createWebSocketTransportConfig,
  type WebSocketTransportDependencies,
  type WebSocketTransportOptions
} from "@agent-remote/transport-ws";
import { BrowserAgentClient } from "./index";

export { createWebSocketTransportConfig as createWSClientConfig };

export function createWSClient(
  options: WebSocketTransportOptions,
  dependencies?: WebSocketTransportDependencies
): BrowserAgentClient {
  return new BrowserAgentClient(createWebSocketTransport(createWebSocketTransportConfig(options), dependencies));
}
