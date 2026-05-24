import {
  validateToolDefinition,
  type ProtocolMessage,
  type ToolDefinition,
  type ToolResult,
  type TransportConnection
} from "agent-remote-core";
import type { SessionAuth, SessionManager } from "agent-remote-server-core";

export interface ExpressAgentEngine {
  readonly sessionManager?: SessionManager;
  handleRegisterTools(sessionId: string, tools: ToolDefinition[]): void | Promise<void>;
  handleUserMessage(sessionId: string, text: string, messageId?: string): void | Promise<void>;
  handleToolResult(sessionId: string, result: ToolResult): void | Promise<void>;
}

export interface ExpressAgentRequest {
  method?: string;
  path?: string;
  url?: string;
  query?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
  on?(event: "close", handler: () => void): unknown;
  emit?(event: "close"): unknown;
}

export interface ExpressAgentResponse {
  status(code: number): ExpressAgentResponse;
  setHeader(name: string, value: string): ExpressAgentResponse | void;
  json(body: unknown): ExpressAgentResponse | void;
  end(): ExpressAgentResponse | void;
  write(chunk: string): boolean | void;
}

export type ExpressAgentNext = (error?: unknown) => void;

export type ExpressAgentRouter = (
  request: ExpressAgentRequest,
  response: ExpressAgentResponse,
  next: ExpressAgentNext
) => void | Promise<void>;

export interface ExpressAgentRouterRoutes {
  readonly sse: string;
  readonly registerTools: string;
  readonly chat: string;
  readonly toolResult: string;
}

export interface ExpressAgentRouterOptions {
  readonly routes?: Partial<ExpressAgentRouterRoutes>;
  readonly sessionAuth?: SessionAuth;
  readonly heartbeatIntervalMs?: number;
}

const DEFAULT_ROUTES: ExpressAgentRouterRoutes = {
  sse: "/sse",
  registerTools: "/api/register_tools",
  chat: "/api/chat",
  toolResult: "/api/tool_result"
};

export function createExpressAgentRouter(
  engine: ExpressAgentEngine,
  options: ExpressAgentRouterOptions = {}
): ExpressAgentRouter {
  const routes = {
    ...DEFAULT_ROUTES,
    ...options.routes
  };

  return async (request, response, next) => {
    try {
      const path = getRequestPath(request);

      if (request.method === "GET" && path === routes.sse) {
        const sessionId = getSessionIdFromRequest(request);
        await verifySession(options.sessionAuth, sessionId, readRequestToken(request), request);
        handleSse(request, response, engine, sessionId, options.heartbeatIntervalMs ?? 30_000);
        return;
      }

      if (request.method === "POST" && path === routes.registerTools) {
        const body = readBody(request);
        const sessionId = readSessionId(body);
        await verifySession(options.sessionAuth, sessionId, readRequestToken(request, body), request);
        const tools = readTools(body);
        await engine.handleRegisterTools(sessionId, tools);
        sendNoContent(response);
        return;
      }

      if (request.method === "POST" && path === routes.chat) {
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
        sendNoContent(response);
        return;
      }

      if (request.method === "POST" && path === routes.toolResult) {
        const body = readBody(request);
        const sessionId = readSessionId(body);
        await verifySession(options.sessionAuth, sessionId, readRequestToken(request, body), request);
        const result = readToolResult(body);
        await engine.handleToolResult(sessionId, result);
        sendNoContent(response);
        return;
      }

      next();
    } catch (error) {
      if (error instanceof HttpError) {
        sendJson(response, error.statusCode, { error: error.message });
        return;
      }

      sendJson(response, 500, { error: "Internal server error" });
    }
  };
}

async function verifySession(
  sessionAuth: SessionAuth | undefined,
  sessionId: string,
  token: string | undefined,
  request: ExpressAgentRequest
): Promise<void> {
  if (!sessionAuth) {
    return;
  }

  if (!(await sessionAuth.verifySession({ sessionId, token, request }))) {
    throw new HttpError(401, "Unauthorized session");
  }
}

function handleSse(
  request: ExpressAgentRequest,
  response: ExpressAgentResponse,
  engine: ExpressAgentEngine,
  sessionId: string,
  heartbeatIntervalMs: number
): void {
  if (!engine.sessionManager) {
    throw new HttpError(501, "SSE requires an engine sessionManager");
  }

  response.status(200);
  response.setHeader("content-type", "text/event-stream");
  response.setHeader("cache-control", "no-cache, no-transform");
  response.setHeader("connection", "keep-alive");
  response.setHeader("x-accel-buffering", "no");
  response.write(": connected\n\n");
  const heartbeat = setInterval(() => {
    response.write(": heartbeat\n\n");
  }, heartbeatIntervalMs);

  const transport: TransportConnection = {
    send(message) {
      response.write(formatSseEvent(message));
    },
    onMessage() {
      // SSE is server-to-client only; POST endpoints carry client-to-server messages.
    },
    close() {
      response.end();
    }
  };

  const handle = engine.sessionManager.attachTransport(sessionId, transport);
  request.on?.("close", () => {
    clearInterval(heartbeat);
    engine.sessionManager?.detachTransport(sessionId, handle);
  });
}

function readBody(request: ExpressAgentRequest): Record<string, unknown> {
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

function getSessionIdFromRequest(request: ExpressAgentRequest): string {
  const query = request.query ?? {};
  const value = query.session_id ?? query.sessionId;

  if (typeof value !== "string" || value.length === 0) {
    throw new HttpError(400, "sessionId is required");
  }

  return value;
}

function readRequestToken(
  request: ExpressAgentRequest,
  body?: Record<string, unknown>
): string | undefined {
  const authorization = request.headers?.authorization;
  const authorizationValue = Array.isArray(authorization) ? authorization[0] : authorization;

  if (authorizationValue?.startsWith("Bearer ")) {
    return authorizationValue.slice("Bearer ".length);
  }

  const query = request.query ?? {};
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

function getRequestPath(request: ExpressAgentRequest): string {
  if (request.path) {
    return request.path;
  }

  return new URL(request.url ?? "/", "http://agent-remote.local").pathname;
}

function sendNoContent(response: ExpressAgentResponse): void {
  response.status(204);
  response.end();
}

function sendJson(response: ExpressAgentResponse, statusCode: number, body: unknown): void {
  response.status(statusCode);
  response.json(body);
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
