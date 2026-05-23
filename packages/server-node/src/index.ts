import type { SessionManager } from "@agent-remote/server-core";

export interface NodeAgentRouter {
  readonly kind: "node";
  readonly manager: SessionManager;
}

export function createNodeAgentRouter(manager: SessionManager): NodeAgentRouter {
  return {
    kind: "node",
    manager
  };
}
