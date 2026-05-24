import {
  createSseTransport,
  createSseTransportConfig,
  type SseTransportConfig,
  type SseTransportDependencies
} from "@agent-remote/transport-sse";
import { BrowserAgentClient } from "./index";

export { createSseTransportConfig as createSSEClientConfig };

export function createSSEClient(
  config: SseTransportConfig,
  dependencies?: SseTransportDependencies
): BrowserAgentClient {
  return new BrowserAgentClient(createSseTransport(config, dependencies));
}
