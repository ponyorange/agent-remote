import type { SessionManager } from "@agent-remote/server-core";

export interface FastifyAgentPlugin {
  readonly kind: "fastify";
  readonly manager: SessionManager;
}

export function createFastifyAgentPlugin(manager: SessionManager): FastifyAgentPlugin {
  return {
    kind: "fastify",
    manager
  };
}
