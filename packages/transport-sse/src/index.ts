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

export function createSseTransportConfig(config: SseTransportConfig): SseTransportConfig {
  if (!config.sseUrl) {
    throw new Error("SSE transport requires an sseUrl.");
  }

  if (!config.sessionId) {
    throw new Error("SSE transport requires a sessionId.");
  }

  return config;
}
