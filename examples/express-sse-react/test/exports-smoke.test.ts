import { describe, expect, it } from "vitest";
import { createHelloMessage } from "agent-remote-core";
import { BrowserAgentClient } from "agent-remote-client";
import { createSSEClient } from "agent-remote-client/sse";
import { createWSClient } from "agent-remote-client/ws";
import { createSseTransport } from "agent-remote-transport-sse";
import { createWebSocketTransport } from "agent-remote-transport-ws";
import { useAgentClient } from "agent-remote-react";
import { AgentEngine, SessionManager } from "agent-remote-server-core";
import { createExpressAgentRouter } from "agent-remote-server-express";
import { createFastifyAgentPlugin } from "agent-remote-server-fastify";
import { createNodeAgentRouter } from "agent-remote-server-node";
import { createRedisAgentConfig } from "agent-remote-server-redis";

describe("package exports", () => {
  it("loads public package entry points and client subpaths", () => {
    expect(createHelloMessage().type).toBe("agent_remote:hello");
    expect(BrowserAgentClient).toBeTypeOf("function");
    expect(createSSEClient).toBeTypeOf("function");
    expect(createWSClient).toBeTypeOf("function");
    expect(createSseTransport).toBeTypeOf("function");
    expect(createWebSocketTransport).toBeTypeOf("function");
    expect(useAgentClient).toBeTypeOf("function");
    expect(AgentEngine).toBeTypeOf("function");
    expect(SessionManager).toBeTypeOf("function");
    expect(createExpressAgentRouter).toBeTypeOf("function");
    expect(createFastifyAgentPlugin).toBeTypeOf("function");
    expect(createNodeAgentRouter).toBeTypeOf("function");
    expect(createRedisAgentConfig).toBeTypeOf("function");
  });
});
