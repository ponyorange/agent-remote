import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { createAssistantMessage } from "@agent-remote/core";
import { SessionManager } from "@agent-remote/server-core";
import {
  createFastifyAgentPlugin,
  type FastifyAgentEngine,
  type FastifyAgentInstance,
  type FastifyAgentReply,
  type FastifyAgentRequest
} from "../src/index";

describe("@agent-remote/server-fastify", () => {
  it("registers Fastify routes", async () => {
    const fastify = createFastify();
    const plugin = createFastifyAgentPlugin(createEngine());

    await plugin(fastify);

    expect(Object.keys(fastify.routes).sort()).toEqual([
      "GET /sse",
      "POST /api/chat",
      "POST /api/register_tools",
      "POST /api/tool_result"
    ]);
  });

  it("routes register tools requests to the engine", async () => {
    const { fastify, engine } = await setup();
    const reply = createReply();

    await fastify.routes["POST /api/register_tools"](
      {
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
      },
      reply
    );

    expect(reply.statusCode).toBe(204);
    expect(engine.handleRegisterTools).toHaveBeenCalledWith("session-1", [
      expect.objectContaining({ name: "export_csv", level: "L1" })
    ]);
  });

  it("routes user messages to the engine", async () => {
    const { fastify, engine } = await setup();
    const reply = createReply();

    await fastify.routes["POST /api/chat"](
      {
        body: {
          session_id: "session-1",
          text: "Export this table"
        }
      },
      reply
    );

    expect(reply.statusCode).toBe(204);
    expect(engine.handleUserMessage).toHaveBeenCalledWith("session-1", "Export this table");
  });

  it("routes tool results to the engine", async () => {
    const { fastify, engine } = await setup();
    const reply = createReply();

    await fastify.routes["POST /api/tool_result"](
      {
        body: {
          sessionId: "session-1",
          result: {
            callId: "call-1",
            ok: true,
            result: { url: "/download.csv" }
          }
        }
      },
      reply
    );

    expect(reply.statusCode).toBe(204);
    expect(engine.handleToolResult).toHaveBeenCalledWith("session-1", {
      callId: "call-1",
      ok: true,
      result: { url: "/download.csv" }
    });
  });

  it("returns bad request for invalid request bodies", async () => {
    const { fastify } = await setup();
    const reply = createReply();

    await fastify.routes["POST /api/chat"]({}, reply);

    expect(reply.statusCode).toBe(400);
    expect(reply.sentBody).toEqual({ error: "JSON body must be an object" });
  });

  it("mounts SSE connections on the session manager", async () => {
    const sessionManager = new SessionManager();
    const { fastify } = await setup(sessionManager);
    const request = createRequest({
      query: { session_id: "session-1" }
    });
    const reply = createReply();

    await fastify.routes["GET /sse"](request, reply);
    await sessionManager.sendToSession("session-1", createAssistantMessage("Done"));

    expect(reply.hijacked).toBe(true);
    expect(reply.headers["content-type"]).toBe("text/event-stream");
    expect(reply.raw.chunks.join("")).toContain("agent_remote:assistant_message");
    request.raw?.emit?.("close");
  });
});

async function setup(sessionManager = new SessionManager()) {
  const fastify = createFastify();
  const engine = createEngine(sessionManager);
  const plugin = createFastifyAgentPlugin(engine);

  await plugin(fastify);

  return { fastify, engine };
}

function createEngine(sessionManager = new SessionManager()): FastifyAgentEngine {
  return {
    sessionManager,
    handleRegisterTools: vi.fn(async () => undefined),
    handleUserMessage: vi.fn(async () => undefined),
    handleToolResult: vi.fn(async () => undefined)
  };
}

function createFastify(): FastifyAgentInstance & {
  routes: Record<string, (request: FastifyAgentRequest, reply: FastifyAgentReply) => Promise<void>>;
} {
  const routes: Record<
    string,
    (request: FastifyAgentRequest, reply: FastifyAgentReply) => Promise<void>
  > = {};

  return {
    routes,
    get(path, handler) {
      routes[`GET ${path}`] = async (request, reply) => {
        await handler(request, reply);
      };
    },
    post(path, handler) {
      routes[`POST ${path}`] = async (request, reply) => {
        await handler(request, reply);
      };
    }
  };
}

function createRequest(init: Partial<FastifyAgentRequest> = {}): FastifyAgentRequest {
  return {
    raw: new EventEmitter(),
    ...init
  };
}

function createReply(): FastifyAgentReply & {
  statusCode: number;
  headers: Record<string, string>;
  sentBody: unknown;
  raw: EventEmitter & { chunks: string[]; write: (chunk: string) => boolean; end: () => void };
  hijacked: boolean;
} {
  const raw = new EventEmitter() as EventEmitter & {
    chunks: string[];
    write: (chunk: string) => boolean;
    end: () => void;
  };
  raw.chunks = [];
  raw.write = (chunk: string) => {
    raw.chunks.push(chunk);
    return true;
  };
  raw.end = vi.fn();

  const reply = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    sentBody: undefined as unknown,
    raw,
    hijacked: false,
    code(statusCode: number) {
      this.statusCode = statusCode;
      return this;
    },
    header(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    send(body?: unknown) {
      this.sentBody = body;
      return this;
    },
    hijack() {
      this.hijacked = true;
      return this;
    }
  };

  return reply;
}
