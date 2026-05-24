import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAssistantMessage } from "@agent-remote/core";
import { SessionManager } from "@agent-remote/server-core";
import { createNodeAgentRouter, type NodeAgentEngine } from "../src/index";

const servers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        })
    )
  );
});

describe("@agent-remote/server-node", () => {
  it("routes register tools requests to the engine", async () => {
    const engine = createEngine();
    const baseUrl = await listen(createNodeAgentRouter(engine));

    const response = await fetch(`${baseUrl}/api/register_tools`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "session-1",
        tools: [
          {
            name: "export_csv",
            description: "Export current table",
            parameters: { type: "object" }
          }
        ]
      })
    });

    expect(response.status).toBe(204);
    expect(engine.handleRegisterTools).toHaveBeenCalledWith("session-1", [
      expect.objectContaining({ name: "export_csv", level: "L1" })
    ]);
  });

  it("rejects requests when session auth fails", async () => {
    const engine = createEngine();
    const baseUrl = await listen(
      createNodeAgentRouter(engine, {
        sessionAuth: {
          async verifySession({ sessionId, token }) {
            return sessionId === "session-1" && token === "valid-token";
          }
        }
      })
    );

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer wrong-token" },
      body: JSON.stringify({
        sessionId: "session-1",
        text: "Export this table"
      })
    });

    expect(response.status).toBe(401);
    expect(engine.handleUserMessage).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      error: "Unauthorized session"
    });
  });

  it("accepts POST query tokens for session auth", async () => {
    const engine = createEngine();
    const baseUrl = await listen(
      createNodeAgentRouter(engine, {
        sessionAuth: {
          async verifySession({ token }) {
            return token === "valid-token";
          }
        }
      })
    );

    const response = await fetch(`${baseUrl}/api/chat?session_token=valid-token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "session-1",
        text: "Export this table"
      })
    });

    expect(response.status).toBe(204);
    expect(engine.handleUserMessage).toHaveBeenCalledWith("session-1", "Export this table");
  });

  it("routes user messages to the engine", async () => {
    const engine = createEngine();
    const baseUrl = await listen(createNodeAgentRouter(engine));

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: "session-1",
        text: "Export this table"
      })
    });

    expect(response.status).toBe(204);
    expect(engine.handleUserMessage).toHaveBeenCalledWith("session-1", "Export this table");
  });

  it("routes tool results to the engine", async () => {
    const engine = createEngine();
    const baseUrl = await listen(createNodeAgentRouter(engine));

    const response = await fetch(`${baseUrl}/api/tool_result`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "session-1",
        result: {
          callId: "call-1",
          ok: true,
          result: { url: "/download.csv" }
        }
      })
    });

    expect(response.status).toBe(204);
    expect(engine.handleToolResult).toHaveBeenCalledWith("session-1", {
      callId: "call-1",
      ok: true,
      result: { url: "/download.csv" }
    });
  });

  it("returns bad request for invalid JSON", async () => {
    const baseUrl = await listen(createNodeAgentRouter(createEngine()));

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{"
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid JSON body"
    });
  });

  it("rejects request bodies that exceed the configured byte limit", async () => {
    const baseUrl = await listen(createNodeAgentRouter(createEngine(), { maxBodyBytes: 10 }));

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "session-1",
        text: "This body is too large"
      })
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: "Request body is too large"
    });
  });

  it("returns not found for unknown routes", async () => {
    const baseUrl = await listen(createNodeAgentRouter(createEngine()));

    const response = await fetch(`${baseUrl}/unknown`);

    expect(response.status).toBe(404);
  });

  it("mounts SSE connections on the session manager", async () => {
    const sessionManager = new SessionManager();
    const engine = createEngine(sessionManager);
    const baseUrl = await listen(createNodeAgentRouter(engine));

    await expect(
      readFirstSseEvent(`${baseUrl}/sse?session_id=session-1`, () =>
        sessionManager.sendToSession("session-1", createAssistantMessage("Done"))
      )
    ).resolves.toContain("agent_remote:assistant_message");
  });
});

function createEngine(sessionManager = new SessionManager()): NodeAgentEngine {
  return {
    sessionManager,
    handleRegisterTools: vi.fn(async () => undefined),
    handleUserMessage: vi.fn(async () => undefined),
    handleToolResult: vi.fn(async () => undefined)
  };
}

async function listen(router: http.RequestListener): Promise<string> {
  const server = http.createServer(router);
  servers.push(server);

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function readFirstSseEvent(url: string, trigger: () => Promise<void>): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = http.get(url, async (response) => {
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        if (chunk.includes("event:")) {
          request.destroy();
          resolve(chunk);
        }
      });

      try {
        await trigger();
      } catch (error) {
        reject(error);
      }
    });

    request.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "ECONNRESET") {
        reject(error);
      }
    });
    request.setTimeout(1_000, () => {
      request.destroy();
      reject(new Error("Timed out waiting for SSE event"));
    });
  });
}
