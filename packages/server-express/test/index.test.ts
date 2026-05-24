import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { createAssistantMessage } from "@agent-remote/core";
import { SessionManager } from "@agent-remote/server-core";
import { createExpressAgentRouter, type ExpressAgentEngine, type ExpressAgentRequest } from "../src/index";

describe("@agent-remote/server-express", () => {
  it("routes register tools requests to the engine", async () => {
    const engine = createEngine();
    const router = createExpressAgentRouter(engine);
    const response = createResponse();

    await router(
      createRequest("POST", "/api/register_tools", {
        body: {
          sessionId: "session-1",
          tools: [
            {
              name: "export_csv",
              description: "Export current table",
              parameters: { type: "object" }
            }
          ]
        }
      }),
      response,
      vi.fn()
    );

    expect(response.statusCode).toBe(204);
    expect(engine.handleRegisterTools).toHaveBeenCalledWith("session-1", [
      expect.objectContaining({ name: "export_csv", level: "L1" })
    ]);
  });

  it("routes user messages to the engine", async () => {
    const engine = createEngine();
    const router = createExpressAgentRouter(engine);
    const response = createResponse();

    await router(
      createRequest("POST", "/api/chat", {
        body: {
          session_id: "session-1",
          text: "Export this table"
        }
      }),
      response,
      vi.fn()
    );

    expect(response.statusCode).toBe(204);
    expect(engine.handleUserMessage).toHaveBeenCalledWith("session-1", "Export this table");
  });

  it("rejects requests when session auth fails", async () => {
    const engine = createEngine();
    const router = createExpressAgentRouter(engine, {
      sessionAuth: {
        async verifySession({ token }) {
          return token === "valid-token";
        }
      }
    });
    const response = createResponse();

    await router(
      createRequest("POST", "/api/chat", {
        headers: { authorization: "Bearer wrong-token" },
        body: {
          sessionId: "session-1",
          text: "Export this table"
        }
      }),
      response,
      vi.fn()
    );

    expect(response.statusCode).toBe(401);
    expect(response.jsonBody).toEqual({ error: "Unauthorized session" });
    expect(engine.handleUserMessage).not.toHaveBeenCalled();
  });

  it("routes tool results to the engine", async () => {
    const engine = createEngine();
    const router = createExpressAgentRouter(engine);
    const response = createResponse();

    await router(
      createRequest("POST", "/api/tool_result", {
        body: {
          sessionId: "session-1",
          result: {
            callId: "call-1",
            ok: true,
            result: { url: "/download.csv" }
          }
        }
      }),
      response,
      vi.fn()
    );

    expect(response.statusCode).toBe(204);
    expect(engine.handleToolResult).toHaveBeenCalledWith("session-1", {
      callId: "call-1",
      ok: true,
      result: { url: "/download.csv" }
    });
  });

  it("returns bad request for invalid request bodies", async () => {
    const router = createExpressAgentRouter(createEngine());
    const response = createResponse();

    await router(createRequest("POST", "/api/chat"), response, vi.fn());

    expect(response.statusCode).toBe(400);
    expect(response.jsonBody).toEqual({ error: "JSON body must be an object" });
  });

  it("passes unknown routes to next middleware", async () => {
    const router = createExpressAgentRouter(createEngine());
    const response = createResponse();
    const next = vi.fn();

    await router(createRequest("GET", "/unknown"), response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(response.ended).toBe(false);
  });

  it("mounts SSE connections on the session manager", async () => {
    const sessionManager = new SessionManager();
    const engine = createEngine(sessionManager);
    const router = createExpressAgentRouter(engine);
    const request = createRequest("GET", "/sse", {
      query: { session_id: "session-1" }
    });
    const response = createResponse();

    await router(request, response, vi.fn());
    await sessionManager.sendToSession("session-1", createAssistantMessage("Done"));

    expect(response.headers["content-type"]).toBe("text/event-stream");
    expect(response.chunks.join("")).toContain("agent_remote:assistant_message");
    request.emit?.("close");
  });
});

function createEngine(sessionManager = new SessionManager()): ExpressAgentEngine {
  return {
    sessionManager,
    handleRegisterTools: vi.fn(async () => undefined),
    handleUserMessage: vi.fn(async () => undefined),
    handleToolResult: vi.fn(async () => undefined)
  };
}

function createRequest(
  method: string,
  path: string,
  init: Partial<ExpressAgentRequest> = {}
): ExpressAgentRequest {
  const request = new EventEmitter() as ExpressAgentRequest;
  request.method = method;
  request.path = path;
  request.url = path;
  request.query = init.query;
  request.body = init.body;
  request.headers = init.headers;
  return request;
}

function createResponse() {
  const response = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    chunks: [] as string[],
    jsonBody: undefined as unknown,
    ended: false,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    json(body: unknown) {
      this.jsonBody = body;
      this.ended = true;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
    write(chunk: string) {
      this.chunks.push(chunk);
      return true;
    }
  };

  return response;
}
