import {
  PROTOCOL_MESSAGE_TYPES,
  validateProtocolMessage,
  type ProtocolDropEvent,
  type ProtocolMessage,
  type RegisterToolsMessage,
  type ToolResultMessage,
  type TransportConnection,
  type UserMessage
} from "agent-remote-core";

export interface SsePostUrls {
  registerTools: string;
  sendMessage: string;
  toolResult: string;
}

export interface SseTransportConfig {
  kind: "sse";
  sseUrl: string;
  postUrls: SsePostUrls;
  sessionId: string;
  retryAttempts?: number;
}

export interface SseEventSourceLike {
  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void;
  close(): void;
}

export interface SseTransportDependencies {
  createEventSource?: (url: string) => SseEventSourceLike;
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
  onProtocolDrop?: (event: ProtocolDropEvent) => void;
}

export function createSseTransportConfig(config: SseTransportConfig): SseTransportConfig {
  if (!config.sseUrl) {
    throw new Error("SSE transport requires an sseUrl.");
  }

  if (!config.sessionId) {
    throw new Error("SSE transport requires a sessionId.");
  }

  if (!config.postUrls.registerTools) {
    throw new Error("SSE transport requires a registerTools post URL.");
  }

  if (!config.postUrls.sendMessage) {
    throw new Error("SSE transport requires a sendMessage post URL.");
  }

  if (!config.postUrls.toolResult) {
    throw new Error("SSE transport requires a toolResult post URL.");
  }

  return config;
}

export function createSseTransport(
  config: SseTransportConfig,
  dependencies: SseTransportDependencies = {}
): TransportConnection {
  const normalizedConfig = createSseTransportConfig(config);
  const handlers = new Set<(message: unknown) => void>();
  const eventSource = createEventSource(
    appendSessionId(normalizedConfig.sseUrl, normalizedConfig.sessionId),
    dependencies
  );
  const fetchImpl = dependencies.fetch ?? globalThis.fetch?.bind(globalThis);

  if (!fetchImpl) {
    throw new Error("SSE transport requires fetch.");
  }

  for (const type of Object.values(PROTOCOL_MESSAGE_TYPES)) {
    eventSource.addEventListener(type, (event) => {
      const message = parseIncomingMessage(event.data, dependencies.onProtocolDrop);

      if (!message) {
        return;
      }

      for (const handler of handlers) {
        handler(message);
      }
    });
  }

  return {
    async send(message) {
      const request = createPostRequest(normalizedConfig, message);

      if (!request) {
        throw new Error(`SSE transport cannot send message type ${message.type}.`);
      }

      await postWithRetry(fetchImpl, request, normalizedConfig.retryAttempts ?? 0);
    },
    onMessage(handler) {
      handlers.add(handler);
    },
    close() {
      eventSource.close();
      handlers.clear();
    }
  };
}

async function postWithRetry(
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>,
  request: { url: string; body: unknown },
  retryAttempts: number
): Promise<void> {
  let lastStatus = 0;

  for (let attempt = 0; attempt <= retryAttempts; attempt += 1) {
    const response = await fetchImpl(request.url, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(request.body)
    });

    if (response.ok) {
      return;
    }

    lastStatus = response.status;
  }

  throw new Error(`SSE transport POST failed with status ${lastStatus}.`);
}

function createEventSource(
  url: string,
  dependencies: SseTransportDependencies
): SseEventSourceLike {
  if (dependencies.createEventSource) {
    return dependencies.createEventSource(url);
  }

  if (!globalThis.EventSource) {
    throw new Error("SSE transport requires EventSource.");
  }

  return new globalThis.EventSource(url);
}

function appendSessionId(sseUrl: string, sessionId: string): string {
  const separator = sseUrl.includes("?") ? "&" : "?";
  return `${sseUrl}${separator}session_id=${encodeURIComponent(sessionId)}`;
}

function parseIncomingMessage(
  data: string,
  onProtocolDrop?: (event: ProtocolDropEvent) => void
): ProtocolMessage | null {
  try {
    const parsed = JSON.parse(data) as unknown;
    const result = validateProtocolMessage(parsed);
    if (result.ok) {
      return result.value;
    }

    onProtocolDrop?.({ reason: "invalid_protocol_message", message: parsed, errors: result.errors });
    return null;
  } catch {
    onProtocolDrop?.({ reason: "malformed_json", message: data });
    return null;
  }
}

function createPostRequest(
  config: SseTransportConfig,
  message: ProtocolMessage
): { url: string; body: unknown } | null {
  switch (message.type) {
    case PROTOCOL_MESSAGE_TYPES.registerTools:
      return {
        url: config.postUrls.registerTools,
        body: {
          sessionId: config.sessionId,
          tools: (message as RegisterToolsMessage).tools
        }
      };
    case PROTOCOL_MESSAGE_TYPES.userMessage:
      return {
        url: config.postUrls.sendMessage,
        body: {
          sessionId: config.sessionId,
          text: (message as UserMessage).text,
          ...((message as UserMessage).messageId ? { messageId: (message as UserMessage).messageId } : {})
        }
      };
    case PROTOCOL_MESSAGE_TYPES.toolResult:
      return {
        url: config.postUrls.toolResult,
        body: {
          sessionId: config.sessionId,
          result: message as ToolResultMessage
        }
      };
    default:
      return null;
  }
}
