import type { SessionManager } from "@agent-remote/server-core";

export interface ExpressAgentRouter {
  readonly kind: "express";
  readonly manager: SessionManager;
}

export function createExpressAgentRouter(manager: SessionManager): ExpressAgentRouter {
  return {
    kind: "express",
    manager
  };
}
