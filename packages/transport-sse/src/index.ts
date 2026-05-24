import {
  PROTOCOL_MESSAGE_TYPES,
  validateProtocolMessage,
  type ProtocolMessage,
  type RegisterToolsMessage,
  type ToolResultMessage,
  type TransportConnection,
  type UserMessage
} from "@agent-remote/core";

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
}

export interface SseEventSourceLike {
  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void;
  close(): void;
}

export interface SseTransportDependencies {
  createEventSource?: (url: string) => SseEventSourceLike;
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
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
      const message = parseIncomingMessage(event.data);

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

      const response = await fetchImpl(request.url, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(request.body)
      });

      if (!response.ok) {
        throw new Error(`SSE transport POST failed with status ${response.status}.`);
      }
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

function parseIncomingMessage(data: string): ProtocolMessage | null {
  try {
    const parsed = JSON.parse(data) as unknown;
    const result = validateProtocolMessage(parsed);
    return result.ok ? result.value : null;
  } catch {
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
          text: (message as UserMessage).text
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
