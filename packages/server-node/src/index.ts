import type { IncomingMessage, RequestListener, ServerResponse } from "node:http";
import {
  validateToolDefinition,
  type ProtocolMessage,
  type ToolDefinition,
  type ToolResult,
  type TransportConnection
} from "agent-remote-core";
import type { SessionAuth, SessionManager } from "agent-remote-server-core";

export interface NodeAgentEngine {
  readonly sessionManager?: SessionManager;
  handleRegisterTools(sessionId: string, tools: ToolDefinition[]): void | Promise<void>;
  handleUserMessage(sessionId: string, text: string, messageId?: string): void | Promise<void>;
  handleToolResult(sessionId: string, result: ToolResult): void | Promise<void>;
}

export interface NodeAgentRouterRoutes {
  readonly sse: string;
  readonly registerTools: string;
  readonly chat: string;
  readonly toolResult: string;
}

export interface NodeAgentRouterOptions {
  readonly routes?: Partial<NodeAgentRouterRoutes>;
  readonly maxBodyBytes?: number;
  readonly sessionAuth?: SessionAuth;
  readonly heartbeatIntervalMs?: number;
}

export type NodeAgentRouter = RequestListener;

const DEFAULT_ROUTES: NodeAgentRouterRoutes = {
  sse: "/sse",
  registerTools: "/api/register_tools",
  chat: "/api/chat",
  toolResult: "/api/tool_result"
};

export function createNodeAgentRouter(
  engine: NodeAgentEngine,
  options: NodeAgentRouterOptions = {}
): NodeAgentRouter {
  const routes = {
    ...DEFAULT_ROUTES,
    ...options.routes
  };
  const maxBodyBytes = options.maxBodyBytes ?? 1024 * 1024;

  return async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://agent-remote.local");

      if (request.method === "GET" && url.pathname === routes.sse) {
        const sessionId = getSessionIdFromUrl(url);
        await verifySession(options.sessionAuth, sessionId, readRequestToken(request, url), request);
        handleSse(request, response, engine, sessionId, options.heartbeatIntervalMs ?? 30_000);
        return;
      }

      if (request.method === "POST" && url.pathname === routes.registerTools) {
        const body = await readJsonBody(request, maxBodyBytes);
        const sessionId = readSessionId(body);
        await verifySession(options.sessionAuth, sessionId, readRequestToken(request, url, body), request);
        const tools = readTools(body);
        await engine.handleRegisterTools(sessionId, tools);
        sendNoContent(response);
        return;
      }

      if (request.method === "POST" && url.pathname === routes.chat) {
        const body = await readJsonBody(request, maxBodyBytes);
        const sessionId = readSessionId(body);
        await verifySession(options.sessionAuth, sessionId, readRequestToken(request, url, body), request);
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

      if (request.method === "POST" && url.pathname === routes.toolResult) {
        const body = await readJsonBody(request, maxBodyBytes);
        const sessionId = readSessionId(body);
        await verifySession(options.sessionAuth, sessionId, readRequestToken(request, url, body), request);
        const result = readToolResult(body);
        await engine.handleToolResult(sessionId, result);
        sendNoContent(response);
        return;
      }

      sendJson(response, 404, { error: "Not found" });
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
  request: IncomingMessage
): Promise<void> {
  if (!sessionAuth) {
    return;
  }

  if (!(await sessionAuth.verifySession({ sessionId, token, request }))) {
    throw new HttpError(401, "Unauthorized session");
  }
}

function handleSse(
  request: IncomingMessage,
  response: ServerResponse,
  engine: NodeAgentEngine,
  sessionId: string,
  heartbeatIntervalMs: number
): void {
  if (!engine.sessionManager) {
    throw new HttpError(501, "SSE requires an engine sessionManager");
  }

  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no"
  });
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
  request.on("close", () => {
    clearInterval(heartbeat);
    engine.sessionManager?.detachTransport(sessionId, handle);
  });
}

async function readJsonBody(
  request: IncomingMessage,
  maxBodyBytes: number
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;

    if (totalBytes > maxBodyBytes) {
      throw new HttpError(413, "Request body is too large");
    }

    chunks.push(buffer);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");

  if (!rawBody.trim()) {
    return {};
  }

  try {
    const value = JSON.parse(rawBody) as unknown;

    if (!isRecord(value)) {
      throw new HttpError(400, "JSON body must be an object");
    }

    return value;
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }

    throw new HttpError(400, "Invalid JSON body");
  }
}

function readSessionId(body: Record<string, unknown>): string {
  const value = body.sessionId ?? body.session_id;

  if (typeof value !== "string" || value.length === 0) {
    throw new HttpError(400, "sessionId is required");
  }

  return value;
}

function getSessionIdFromUrl(url: URL): string {
  const sessionId = url.searchParams.get("session_id") ?? url.searchParams.get("sessionId");

  if (!sessionId) {
    throw new HttpError(400, "sessionId is required");
  }

  return sessionId;
}

function readRequestToken(
  request: IncomingMessage,
  url?: URL,
  body?: Record<string, unknown>
): string | undefined {
  const authorization = request.headers.authorization;

  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length);
  }

  const queryToken = url?.searchParams.get("session_token") ?? url?.searchParams.get("token");

  if (queryToken) {
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

function sendNoContent(response: ServerResponse): void {
  response.writeHead(204);
  response.end();
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, {
    "content-type": "application/json"
  });
  response.end(JSON.stringify(body));
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
