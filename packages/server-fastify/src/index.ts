import {
  validateToolDefinition,
  type ProtocolMessage,
  type ToolDefinition,
  type ToolResult,
  type TransportConnection
} from "@agent-remote/core";
import type { SessionManager } from "@agent-remote/server-core";

export interface FastifyAgentEngine {
  readonly sessionManager?: SessionManager;
  handleRegisterTools(sessionId: string, tools: ToolDefinition[]): void | Promise<void>;
  handleUserMessage(sessionId: string, text: string): void | Promise<void>;
  handleToolResult(sessionId: string, result: ToolResult): void | Promise<void>;
}

export interface FastifyAgentRequest {
  query?: unknown;
  body?: unknown;
  raw?: {
    on?(event: "close", handler: () => void): unknown;
    emit?(event: "close"): unknown;
  };
}

export interface FastifyAgentRawReply {
  write(chunk: string): boolean | void;
  end(): void;
}

export interface FastifyAgentReply {
  raw?: FastifyAgentRawReply;
  code(statusCode: number): FastifyAgentReply;
  header(name: string, value: string): FastifyAgentReply;
  send(body?: unknown): FastifyAgentReply | void;
}

export type FastifyAgentHandler = (
  request: FastifyAgentRequest,
  reply: FastifyAgentReply
) => void | Promise<void>;

export interface FastifyAgentInstance {
  get(path: string, handler: FastifyAgentHandler): void;
  post(path: string, handler: FastifyAgentHandler): void;
}

export type FastifyAgentPlugin = (fastify: FastifyAgentInstance) => void | Promise<void>;

export interface FastifyAgentRoutes {
  readonly sse: string;
  readonly registerTools: string;
  readonly chat: string;
  readonly toolResult: string;
}

export interface FastifyAgentPluginOptions {
  readonly routes?: Partial<FastifyAgentRoutes>;
}

const DEFAULT_ROUTES: FastifyAgentRoutes = {
  sse: "/sse",
  registerTools: "/api/register_tools",
  chat: "/api/chat",
  toolResult: "/api/tool_result"
};

export function createFastifyAgentPlugin(
  engine: FastifyAgentEngine,
  options: FastifyAgentPluginOptions = {}
): FastifyAgentPlugin {
  const routes = {
    ...DEFAULT_ROUTES,
    ...options.routes
  };

  return async (fastify) => {
    fastify.get(routes.sse, async (request, reply) => {
      try {
        handleSse(request, reply, engine, getSessionIdFromRequest(request));
      } catch (error) {
        sendError(reply, error);
      }
    });

    fastify.post(routes.registerTools, async (request, reply) => {
      try {
        const body = readBody(request);
        const sessionId = readSessionId(body);
        const tools = readTools(body);
        await engine.handleRegisterTools(sessionId, tools);
        sendNoContent(reply);
      } catch (error) {
        sendError(reply, error);
      }
    });

    fastify.post(routes.chat, async (request, reply) => {
      try {
        const body = readBody(request);
        const sessionId = readSessionId(body);
        const text = readString(body, "text");
        await engine.handleUserMessage(sessionId, text);
        sendNoContent(reply);
      } catch (error) {
        sendError(reply, error);
      }
    });

    fastify.post(routes.toolResult, async (request, reply) => {
      try {
        const body = readBody(request);
        const sessionId = readSessionId(body);
        const result = readToolResult(body);
        await engine.handleToolResult(sessionId, result);
        sendNoContent(reply);
      } catch (error) {
        sendError(reply, error);
      }
    });
  };
}

function handleSse(
  request: FastifyAgentRequest,
  reply: FastifyAgentReply,
  engine: FastifyAgentEngine,
  sessionId: string
): void {
  if (!engine.sessionManager) {
    throw new HttpError(501, "SSE requires an engine sessionManager");
  }

  if (!reply.raw) {
    throw new HttpError(500, "Fastify reply raw stream is required for SSE");
  }

  reply.code(200);
  reply.header("content-type", "text/event-stream");
  reply.header("cache-control", "no-cache, no-transform");
  reply.header("connection", "keep-alive");
  reply.header("x-accel-buffering", "no");
  reply.raw.write(": connected\n\n");

  const raw = reply.raw;
  const transport: TransportConnection = {
    send(message) {
      raw.write(formatSseEvent(message));
    },
    onMessage() {
      // SSE is server-to-client only; POST routes carry client-to-server messages.
    },
    close() {
      raw.end();
    }
  };

  engine.sessionManager.attachTransport(sessionId, transport);
  request.raw?.on?.("close", () => {
    engine.sessionManager?.detachTransport(sessionId);
  });
}

function readBody(request: FastifyAgentRequest): Record<string, unknown> {
  if (!isRecord(request.body)) {
    throw new HttpError(400, "JSON body must be an object");
  }

  return request.body;
}

function readSessionId(body: Record<string, unknown>): string {
  const value = body.sessionId ?? body.session_id;

  if (typeof value !== "string" || value.length === 0) {
    throw new HttpError(400, "sessionId is required");
  }

  return value;
}

function getSessionIdFromRequest(request: FastifyAgentRequest): string {
  const query = isRecord(request.query) ? request.query : {};
  const value = query.session_id ?? query.sessionId;

  if (typeof value !== "string" || value.length === 0) {
    throw new HttpError(400, "sessionId is required");
  }

  return value;
}

function readTools(body: Record<string, unknown>): ToolDefinition[] {
  if (!Array.isArray(body.tools)) {
    throw new HttpError(400, "tools must be an array");
  }

  return body.tools.map((tool, index) => {
    const result = validateToolDefinition(tool);

    if (!result.ok) {
      throw new HttpError(400, `Invalid tool at index ${index}`);
    }

    return result.value;
  });
}

function readToolResult(body: Record<string, unknown>): ToolResult {
  const input = isRecord(body.result) ? body.result : body;
  const callId = input.callId;
  const ok = input.ok;

  if (typeof callId !== "string" || callId.length === 0) {
    throw new HttpError(400, "tool result callId is required");
  }

  if (typeof ok !== "boolean") {
    throw new HttpError(400, "tool result ok must be a boolean");
  }

  return {
    callId,
    ok,
    ...(input.result !== undefined ? { result: input.result } : {}),
    ...(typeof input.error === "string" ? { error: input.error } : {})
  };
}

function readString(body: Record<string, unknown>, key: string): string {
  const value = body[key];

  if (typeof value !== "string") {
    throw new HttpError(400, `${key} must be a string`);
  }

  return value;
}

function sendNoContent(reply: FastifyAgentReply): void {
  reply.code(204).send();
}

function sendError(reply: FastifyAgentReply, error: unknown): void {
  if (error instanceof HttpError) {
    reply.code(error.statusCode).send({ error: error.message });
    return;
  }

  reply.code(500).send({ error: "Internal server error" });
}

function formatSseEvent(message: ProtocolMessage): string {
  return `event: ${message.type}\ndata: ${JSON.stringify(message)}\n\n`;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string
  ) {
    super(message);
  }
}
