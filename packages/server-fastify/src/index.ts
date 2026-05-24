import {
  validateToolDefinition,
  type ProtocolMessage,
  type ToolDefinition,
  type ToolResult,
  type TransportConnection
} from "agent-remote-core";
import type { SessionAuth, SessionManager } from "agent-remote-server-core";

export interface FastifyAgentEngine {
  readonly sessionManager?: SessionManager;
  handleRegisterTools(sessionId: string, tools: ToolDefinition[]): void | Promise<void>;
  handleUserMessage(sessionId: string, text: string, messageId?: string): void | Promise<void>;
  handleToolResult(sessionId: string, result: ToolResult): void | Promise<void>;
}

export interface FastifyAgentRequest {
  query?: unknown;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
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
  hijack?(): FastifyAgentReply | void;
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
  readonly sessionAuth?: SessionAuth;
  readonly heartbeatIntervalMs?: number;
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
        const sessionId = getSessionIdFromRequest(request);
        await verifySession(options.sessionAuth, sessionId, readRequestToken(request), request);
        handleSse(request, reply, engine, sessionId, options.heartbeatIntervalMs ?? 30_000);
      } catch (error) {
        sendError(reply, error);
      }
    });

    fastify.post(routes.registerTools, async (request, reply) => {
      try {
        const body = readBody(request);
        const sessionId = readSessionId(body);
        await verifySession(options.sessionAuth, sessionId, readRequestToken(request, body), request);
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
        await verifySession(options.sessionAuth, sessionId, readRequestToken(request, body), request);
        const text = readString(body, "text");
        const messageId = readOptionalString(body, "messageId");
        if (messageId) {
          await engine.handleUserMessage(sessionId, text, messageId);
        } else {
          await engine.handleUserMessage(sessionId, text);
        }
        sendNoContent(reply);
      } catch (error) {
        sendError(reply, error);
      }
    });

    fastify.post(routes.toolResult, async (request, reply) => {
      try {
        const body = readBody(request);
        const sessionId = readSessionId(body);
        await verifySession(options.sessionAuth, sessionId, readRequestToken(request, body), request);
        const result = readToolResult(body);
        await engine.handleToolResult(sessionId, result);
        sendNoContent(reply);
      } catch (error) {
        sendError(reply, error);
      }
    });
  };
}

async function verifySession(
  sessionAuth: SessionAuth | undefined,
  sessionId: string,
  token: string | undefined,
  request: FastifyAgentRequest
): Promise<void> {
  if (!sessionAuth) {
    return;
  }

  if (!(await sessionAuth.verifySession({ sessionId, token, request }))) {
    throw new HttpError(401, "Unauthorized session");
  }
}

function handleSse(
  request: FastifyAgentRequest,
  reply: FastifyAgentReply,
  engine: FastifyAgentEngine,
  sessionId: string,
  heartbeatIntervalMs: number
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
  reply.hijack?.();
  reply.raw.write(": connected\n\n");
  const heartbeat = setInterval(() => {
    reply.raw?.write(": heartbeat\n\n");
  }, heartbeatIntervalMs);

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

  const handle = engine.sessionManager.attachTransport(sessionId, transport);
  request.raw?.on?.("close", () => {
    clearInterval(heartbeat);
    engine.sessionManager?.detachTransport(sessionId, handle);
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

function readRequestToken(
  request: FastifyAgentRequest,
  body?: Record<string, unknown>
): string | undefined {
  const authorization = request.headers?.authorization;
  const authorizationValue = Array.isArray(authorization) ? authorization[0] : authorization;

  if (authorizationValue?.startsWith("Bearer ")) {
    return authorizationValue.slice("Bearer ".length);
  }

  const query = isRecord(request.query) ? request.query : {};
  const queryToken = query.session_token ?? query.token;

  if (typeof queryToken === "string") {
    return queryToken;
  }

  const bodyToken = body?.sessionToken ?? body?.session_token;
  return typeof bodyToken === "string" ? bodyToken : undefined;
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

function readOptionalString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
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
