import { describe, expect, it } from "vitest";
import {
  createAssistantMessage,
  createToolCallMessage,
  createToolResultMessage,
  createUserMessage,
  type ProtocolMessage
} from "agent-remote-core";
import {
  createSseTransport,
  createSseTransportConfig,
  type SseEventSourceLike
} from "../src/index";

describe("agent-remote-transport-sse", () => {
  it("creates an SSE transport config", () => {
    expect(
      createSseTransportConfig({
        kind: "sse",
        sseUrl: "/sse",
        sessionId: "session-1",
        postUrls: {
          registerTools: "/api/register_tools",
          sendMessage: "/api/chat",
          toolResult: "/api/tool_result"
        }
      })
    ).toMatchObject({
      kind: "sse",
      sseUrl: "/sse",
      sessionId: "session-1"
    });
  });

  it("requires a session id", () => {
    expect(() =>
      createSseTransportConfig({
        kind: "sse",
        sseUrl: "/sse",
        sessionId: "",
        postUrls: {
          registerTools: "/api/register_tools",
          sendMessage: "/api/chat",
          toolResult: "/api/tool_result"
        }
      })
    ).toThrow("SSE transport requires a sessionId.");
  });

  it("opens EventSource with the session id query parameter", () => {
    const createdSources: FakeEventSource[] = [];

    createSseTransport(baseConfig({ sseUrl: "/sse?existing=1" }), {
      createEventSource(url) {
        const source = new FakeEventSource(url);
        createdSources.push(source);
        return source;
      },
      fetch: async () => new Response(null, { status: 204 })
    });

    expect(createdSources[0]?.url).toBe("/sse?existing=1&session_id=session-1");
  });

  it("dispatches valid SSE protocol events to message handlers", () => {
    const source = new FakeEventSource("/sse");
    const received: unknown[] = [];
    const transport = createSseTransport(baseConfig(), {
      createEventSource: () => source,
      fetch: async () => new Response(null, { status: 204 })
    });
    const message = createAssistantMessage("Done");

    transport.onMessage((event) => received.push(event));
    source.emit(message);

    expect(received).toEqual([message]);
  });

  it("reports invalid SSE payloads through the protocol drop hook", () => {
    const source = new FakeEventSource("/sse");
    const drops: unknown[] = [];
    const transport = createSseTransport(baseConfig(), {
      createEventSource: () => source,
      fetch: async () => new Response(null, { status: 204 }),
      onProtocolDrop: (event) => drops.push(event)
    });
    const received: unknown[] = [];

    transport.onMessage((event) => received.push(event));
    source.emitRaw("agent_remote:assistant_message", "{\"type\":\"chat_message\",\"text\":\"hello\"}");
    source.emitRaw("agent_remote:assistant_message", "not-json");

    expect(received).toEqual([]);
    expect(drops).toEqual([
      expect.objectContaining({ reason: "invalid_protocol_message" }),
      expect.objectContaining({ reason: "malformed_json" })
    ]);
  });

  it("posts user messages to the configured chat endpoint", async () => {
    const requests: FetchRequest[] = [];
    const transport = createSseTransport(baseConfig(), {
      createEventSource: (url) => new FakeEventSource(url),
      fetch: recordFetch(requests)
    });

    await transport.send(createUserMessage("Export this table"));

    expect(requests).toEqual([
      {
        url: "/api/chat",
        body: {
          sessionId: "session-1",
          text: "Export this table"
        }
      }
    ]);
  });

  it("waits for the EventSource open event before posting messages", async () => {
    const source = new FakeEventSource("/sse", { autoOpen: false });
    const requests: FetchRequest[] = [];
    const transport = createSseTransport(baseConfig(), {
      createEventSource: () => source,
      fetch: recordFetch(requests)
    });
    const sendPromise = transport.send(createUserMessage("Export this table"));

    await flushAsync();
    expect(requests).toEqual([]);

    source.open();
    await sendPromise;

    expect(requests).toHaveLength(1);
  });

  it("posts immediately when the EventSource is already open before the first send", async () => {
    const source = new FakeEventSource("/sse", { autoOpen: false });
    const requests: FetchRequest[] = [];
    const transport = createSseTransport(baseConfig(), {
      createEventSource: () => source,
      fetch: recordFetch(requests)
    });

    source.open();
    await transport.send(createUserMessage("Export this table"));

    expect(requests).toHaveLength(1);
  });

  it("rejects sends when the EventSource does not open before the timeout", async () => {
    const source = new FakeEventSource("/sse", { autoOpen: false });
    const transport = createSseTransport(baseConfig({ openTimeoutMs: 1 }), {
      createEventSource: () => source,
      fetch: async () => new Response(null, { status: 204 })
    });

    await expect(transport.send(createUserMessage("Export this table"))).rejects.toThrow(
      "SSE transport did not open within 1ms."
    );
    expect(source.closed).toBe(true);
  });

  it("does not start the EventSource open timeout until a message is sent", async () => {
    const source = new FakeEventSource("/sse", { autoOpen: false });
    createSseTransport(baseConfig({ openTimeoutMs: 1 }), {
      createEventSource: () => source,
      fetch: async () => new Response(null, { status: 204 })
    });

    await wait(5);

    expect(source.closed).toBe(false);
  });

  it("retries failed POST requests when configured", async () => {
    const statuses = [503, 204];
    const requests: FetchRequest[] = [];
    const transport = createSseTransport(baseConfig({ retryAttempts: 1 }), {
      createEventSource: (url) => new FakeEventSource(url),
      fetch: async (url, init) => {
        requests.push({
          url,
          body: JSON.parse(String(init?.body))
        });
        return new Response(null, { status: statuses.shift() ?? 204 });
      }
    });

    await transport.send(createUserMessage("Export this table"));

    expect(requests).toHaveLength(2);
  });

  it("posts tool results to the configured tool result endpoint", async () => {
    const requests: FetchRequest[] = [];
    const transport = createSseTransport(baseConfig(), {
      createEventSource: (url) => new FakeEventSource(url),
      fetch: recordFetch(requests)
    });

    await transport.send(createToolResultMessage({ callId: "call-1", ok: true, result: "done" }));

    expect(requests).toEqual([
      {
        url: "/api/tool_result",
        body: {
          sessionId: "session-1",
          result: {
            type: "agent_remote:tool_result",
            callId: "call-1",
            ok: true,
            result: "done"
          }
        }
      }
    ]);
  });

  it("rejects server-to-client messages sent through HTTP POST", async () => {
    const transport = createSseTransport(baseConfig(), {
      createEventSource: (url) => new FakeEventSource(url),
      fetch: async () => new Response(null, { status: 204 })
    });

    await expect(
      transport.send(createToolCallMessage({ callId: "call-1", name: "export_csv", arguments: {} }))
    ).rejects.toThrow("SSE transport cannot send message type agent_remote:tool_call.");
  });

  it("closes the EventSource", async () => {
    const source = new FakeEventSource("/sse");
    const transport = createSseTransport(baseConfig(), {
      createEventSource: () => source,
      fetch: async () => new Response(null, { status: 204 })
    });

    await transport.close();

    expect(source.closed).toBe(true);
  });
});

interface FetchRequest {
  url: string;
  body: unknown;
}

class FakeEventSource implements SseEventSourceLike {
  readonly listeners = new Map<string, Array<(event: MessageEvent<string>) => void>>();
  closed = false;
  readyState = 0;

  constructor(readonly url: string, options: { autoOpen?: boolean } = {}) {
    if (options.autoOpen !== false) {
      queueMicrotask(() => this.open());
    }
  }

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  close(): void {
    this.closed = true;
  }

  open(): void {
    this.readyState = 1;
    this.emitRaw("open", "");
  }

  emit(message: ProtocolMessage): void {
    const event = { data: JSON.stringify(message) } as MessageEvent<string>;
    for (const listener of this.listeners.get(message.type) ?? []) {
      listener(event);
    }
  }

  emitRaw(type: string, data: string): void {
    const event = { data } as MessageEvent<string>;
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function baseConfig(overrides: Partial<ReturnType<typeof createSseTransportConfig>> = {}) {
  return createSseTransportConfig({
    kind: "sse",
    sseUrl: "/sse",
    sessionId: "session-1",
    postUrls: {
      registerTools: "/api/register_tools",
      sendMessage: "/api/chat",
      toolResult: "/api/tool_result"
    },
    ...overrides
  });
}

function recordFetch(requests: FetchRequest[]) {
  return async (url: string, init?: RequestInit) => {
    requests.push({
      url,
      body: JSON.parse(String(init?.body))
    });

    return new Response(null, { status: 204 });
  };
}
