import {
  createSseTransport,
  createSseTransportConfig,
  type SseTransportConfig,
  type SseTransportDependencies
} from "@agent-remote/transport-sse";
import { BrowserAgentClient, type BrowserAgentClientOptions } from "./index";

export { createSseTransportConfig as createSSEClientConfig };

export function createSSEClient(
  config: SseTransportConfig,
  dependencies?: SseTransportDependencies,
  options?: BrowserAgentClientOptions
): BrowserAgentClient {
  return new BrowserAgentClient(createSseTransport(config, dependencies), options);
}
