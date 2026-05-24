import { describe, expect, it, vi } from "vitest";
import {
  createAssistantMessage,
  createToolCallMessage,
  type ToolCall,
  type TransportConnection
} from "@agent-remote/core";
import {
  AgentEngine,
  InMemoryStore,
  LocalBroker,
  OpenAILLMClient,
  SessionManager,
  type LLMClient,
  type MessageHandler
} from "../src/index";

describe("@agent-remote/server-core", () => {
  it("stores registered tools by session", async () => {
    const store = new InMemoryStore();
    const manager = new SessionManager(store);

    await manager.registerTools("session-1", [
      {
        name: "export_csv",
        description: "Export current table as CSV",
        parameters: { type: "object" }
      }
    ]);

    await expect(store.get("session-1")).resolves.toMatchObject({
      tools: [{ name: "export_csv" }],
      messages: []
    });
  });

  it("deletes stored sessions", async () => {
    const store = new InMemoryStore();
    await store.set("session-1", { tools: [], messages: [] });

    await store.delete("session-1");

    await expect(store.get("session-1")).resolves.toBeNull();
  });

  it("saves and reads session data through the manager", async () => {
    const manager = new SessionManager();

    await manager.saveData("session-1", {
      tools: [],
      messages: [{ role: "user", content: "Export this table" }]
    });

    await expect(manager.getData("session-1")).resolves.toEqual({
      tools: [],
      messages: [{ role: "user", content: "Export this table" }]
    });
  });

  it("preserves messages and normalizes tools when registering tools", async () => {
    const manager = new SessionManager();
    await manager.saveData("session-1", {
      tools: [],
      messages: [{ role: "user", content: "Keep this history" }]
    });

    const data = await manager.registerTools("session-1", [
      {
        name: "export_csv",
        description: "Export current table as CSV",
        parameters: { type: "object" }
      }
    ]);

    expect(data).toMatchObject({
      tools: [{ name: "export_csv", level: "L1" }],
      messages: [{ role: "user", content: "Keep this history" }]
    });
  });

  it("sends messages to a locally attached transport before using the broker", async () => {
    const broker = new LocalBroker();
    const publish = vi.spyOn(broker, "publish");
    const send = vi.fn();
    const manager = new SessionManager(new InMemoryStore(), broker);
    const transport: TransportConnection = {
      send,
      onMessage: vi.fn(),
      close: vi.fn()
    };
    const message = createToolCallMessage({
      callId: "call-1",
      name: "export_csv",
      arguments: { format: "csv" }
    });

    manager.attachTransport("session-1", transport);
    await manager.sendToSession("session-1", message);

    expect(send).toHaveBeenCalledWith(message);
    expect(publish).not.toHaveBeenCalled();
  });

  it("publishes messages through the broker when no local transport is attached", async () => {
    const broker = new LocalBroker();
    const publish = vi.spyOn(broker, "publish");
    const manager = new SessionManager(new InMemoryStore(), broker);
    const message = createAssistantMessage("Done");

    await manager.sendToSession("session-1", message);

    expect(publish).toHaveBeenCalledWith("session-1", message);
  });

  it("routes broker messages to the manager that owns the local transport", async () => {
    const broker = new LocalBroker();
    const send = vi.fn();
    const remoteManager = new SessionManager(new InMemoryStore(), broker);
    const localManager = new SessionManager(new InMemoryStore(), broker);
    const message = createAssistantMessage("Done");

    localManager.attachTransport("session-1", {
      send,
      onMessage: vi.fn(),
      close: vi.fn()
    });
    await remoteManager.sendToSession("session-1", message);

    expect(send).toHaveBeenCalledWith(message);
  });

  it("broadcasts local session messages to all attached transports", async () => {
    const manager = new SessionManager();
    const first = vi.fn();
    const second = vi.fn();
    const message = createAssistantMessage("Done");

    manager.attachTransport("session-1", transportWithSend(first));
    manager.attachTransport("session-1", transportWithSend(second));
    await manager.sendToSession("session-1", message);

    expect(first).toHaveBeenCalledWith(message);
    expect(second).toHaveBeenCalledWith(message);
  });

  it("does not detach a newer transport when an older transport closes", async () => {
    const manager = new SessionManager();
    const oldSend = vi.fn();
    const newSend = vi.fn();
    const oldHandle = manager.attachTransport("session-1", transportWithSend(oldSend));
    manager.attachTransport("session-1", transportWithSend(newSend));

    manager.detachTransport("session-1", oldHandle);
    await manager.sendToSession("session-1", createAssistantMessage("Done"));

    expect(oldSend).not.toHaveBeenCalled();
    expect(newSend).toHaveBeenCalledWith(createAssistantMessage("Done"));
  });

  it("waits for asynchronous broker subscription before sending", async () => {
    let subscribed = false;
    const broker = new DeferredBroker(async () => {
      subscribed = true;
    });
    const manager = new SessionManager(new InMemoryStore(), broker);

    await manager.ready();

    expect(subscribed).toBe(true);
  });

  it("registers tools through AgentEngine", async () => {
    const manager = new SessionManager();
    const engine = new AgentEngine({ llmClient: new FakeLLMClient(), sessionManager: manager });

    expect(engine.sessionManager).toBe(manager);

    await engine.handleRegisterTools("session-1", [
      {
        name: "echo",
        description: "Echo input",
        parameters: { type: "object" }
      }
    ]);

    await expect(manager.getData("session-1")).resolves.toMatchObject({
      tools: [{ name: "echo", level: "L1" }]
    });
  });

  it("sends assistant responses after user messages", async () => {
    const send = vi.fn();
    const manager = new SessionManager();
    manager.attachTransport("session-1", transportWithSend(send));
    const llmClient = new FakeLLMClient({ text: "Export complete" });
    const engine = new AgentEngine({ llmClient, sessionManager: manager });

    await engine.handleUserMessage("session-1", "Export this table");

    expect(llmClient.requests[0]?.messages).toEqual([
      { role: "user", content: "Export this table" }
    ]);
    expect(send).toHaveBeenCalledWith(createAssistantMessage("Export complete"));
    await expect(manager.getData("session-1")).resolves.toMatchObject({
      messages: [
        { role: "user", content: "Export this table" },
        { role: "assistant", content: "Export complete" }
      ]
    });
  });

  it("sends tool calls returned by the LLM", async () => {
    const send = vi.fn();
    const manager = new SessionManager();
    manager.attachTransport("session-1", transportWithSend(send));
    const toolCall = { callId: "call-1", name: "export_csv", arguments: { format: "csv" } };
    const engine = new AgentEngine({
      llmClient: new FakeLLMClient({ toolCalls: [toolCall] }),
      sessionManager: manager
    });

    await engine.handleUserMessage("session-1", "Export this table");

    expect(send).toHaveBeenCalledWith(createToolCallMessage(toolCall));
    await expect(manager.getData("session-1")).resolves.toMatchObject({
      messages: [
        { role: "user", content: "Export this table" },
        { role: "assistant", toolCalls: [toolCall] }
      ]
    });
  });

  it("continues the LLM flow after tool results", async () => {
    const send = vi.fn();
    const manager = new SessionManager();
    manager.attachTransport("session-1", transportWithSend(send));
    const engine = new AgentEngine({
      llmClient: new FakeLLMClient({ text: "Tool result processed" }),
      sessionManager: manager
    });

    await engine.handleToolResult("session-1", { callId: "call-1", ok: true, result: "done" });

    expect(send).toHaveBeenCalledWith(createAssistantMessage("Tool result processed"));
    await expect(manager.getData("session-1")).resolves.toMatchObject({
      messages: [
        {
          role: "tool",
          toolCallId: "call-1",
          content: JSON.stringify({ callId: "call-1", ok: true, result: "done" })
        },
        { role: "assistant", content: "Tool result processed" }
      ]
    });
  });

  it("handles search_tools calls before continuing LLM flow", async () => {
    const send = vi.fn();
    const manager = new SessionManager();
    manager.attachTransport("session-1", transportWithSend(send));
    await manager.registerTools("session-1", [
      {
        name: "export_csv",
        description: "Export data",
        parameters: { type: "object" },
        domain: "export"
      },
      {
        name: "change_theme",
        description: "Change theme",
        parameters: { type: "object" },
        domain: "ui"
      }
    ]);
    const llmClient = new QueueLLMClient([
      {
        toolCalls: [
          {
            callId: "search-1",
            name: "search_tools",
            arguments: { query: "export", maxResults: 1 }
          }
        ]
      },
      { text: "Use export_csv" }
    ]);
    const engine = new AgentEngine({ llmClient, sessionManager: manager });

    await engine.handleUserMessage("session-1", "Find export tools");

    expect(llmClient.requests).toHaveLength(2);
    expect(llmClient.requests[1]?.messages.at(-1)?.content).toContain("export_csv");
    expect(send).toHaveBeenCalledWith(createAssistantMessage("Use export_csv"));
  });

  it("only records paired search_tools calls when search and normal tool calls are mixed", async () => {
    const manager = new SessionManager();
    await manager.registerTools("session-1", [
      {
        name: "export_csv",
        description: "Export data",
        parameters: { type: "object" },
        domain: "export"
      }
    ]);
    const llmClient = new QueueLLMClient([
      {
        toolCalls: [
          {
            callId: "search-1",
            name: "search_tools",
            arguments: { query: "export" }
          },
          {
            callId: "call-1",
            name: "export_csv",
            arguments: { format: "csv" }
          }
        ]
      },
      { text: "Use export_csv" }
    ]);
    const engine = new AgentEngine({ llmClient, sessionManager: manager });

    await engine.handleUserMessage("session-1", "Find export tools");

    const data = await manager.getData("session-1");
    expect(data?.messages[1]).toMatchObject({
      role: "assistant",
      toolCalls: [
        {
          callId: "search-1",
          name: "search_tools"
        }
      ]
    });
    expect(data?.messages[2]).toMatchObject({
      role: "tool",
      toolCallId: "search-1"
    });
  });

  it("exposes L1 tools and the built-in search_tools tool to the LLM", async () => {
    const manager = new SessionManager();
    await manager.registerTools("session-1", [
      {
        name: "always_visible",
        description: "Visible tool",
        parameters: { type: "object" },
        level: "L1"
      },
      {
        name: "search_only",
        description: "Search-only tool",
        parameters: { type: "object" },
        level: "L2"
      }
    ]);
    const llmClient = new FakeLLMClient({ text: "Done" });
    const engine = new AgentEngine({ llmClient, sessionManager: manager });

    await engine.handleUserMessage("session-1", "What can you do?");

    expect(llmClient.requests[0]?.tools.map((tool) => tool.name)).toEqual([
      "always_visible",
      "search_tools"
    ]);
  });

  it("creates OpenAI chat completions through fetch", async () => {
    const requests: unknown[] = [];
    const client = new OpenAILLMClient({
      apiKey: "test-key",
      model: "gpt-test",
      fetch: async (_url, init) => {
        requests.push(JSON.parse(String(init?.body)));
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "Hello" } }]
          }),
          { status: 200 }
        );
      }
    });

    await expect(
      client.chat({
        messages: [{ role: "user", content: "Hi" }],
        tools: [
          {
            name: "echo",
            description: "Echo input",
            parameters: { type: "object" }
          }
        ]
      })
    ).resolves.toEqual({
      text: "Hello"
    });
    expect(requests[0]).toMatchObject({
      model: "gpt-test",
      messages: [{ role: "user", content: "Hi" }],
      tools: [
        {
          type: "function",
          function: {
            name: "echo",
            description: "Echo input",
            parameters: { type: "object" }
          }
        }
      ]
    });
  });

  it("serializes OpenAI assistant tool calls and tool results", async () => {
    const requests: unknown[] = [];
    const client = new OpenAILLMClient({
      apiKey: "test-key",
      model: "gpt-test",
      fetch: async (_url, init) => {
        requests.push(JSON.parse(String(init?.body)));
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "Done" } }]
          }),
          { status: 200 }
        );
      }
    });

    await client.chat({
      messages: [
        {
          role: "assistant",
          content: "",
          toolCalls: [{ callId: "call-1", name: "export_csv", arguments: { format: "csv" } }]
        },
        {
          role: "tool",
          toolCallId: "call-1",
          content: JSON.stringify({ callId: "call-1", ok: true, result: "done" })
        }
      ],
      tools: []
    });

    expect(requests[0]).toMatchObject({
      messages: [
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call-1",
              type: "function",
              function: {
                name: "export_csv",
                arguments: "{\"format\":\"csv\"}"
              }
            }
          ]
        },
        {
          role: "tool",
          tool_call_id: "call-1",
          content: JSON.stringify({ callId: "call-1", ok: true, result: "done" })
        }
      ]
    });
  });

  it("parses OpenAI tool calls into LLM tool calls", async () => {
    const client = new OpenAILLMClient({
      apiKey: "test-key",
      model: "gpt-test",
      fetch: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  tool_calls: [
                    {
                      id: "call-1",
                      function: {
                        name: "export_csv",
                        arguments: "{\"format\":\"csv\"}"
                      }
                    }
                  ]
                }
              }
            ]
          }),
          { status: 200 }
        )
    });

    await expect(client.chat({ messages: [], tools: [] })).resolves.toEqual({
      toolCalls: [{ callId: "call-1", name: "export_csv", arguments: { format: "csv" } }]
    });
  });
});

function transportWithSend(send: (message: unknown) => void): TransportConnection {
  return {
    send,
    onMessage: vi.fn(),
    close: vi.fn()
  };
}

class DeferredBroker extends LocalBroker {
  constructor(private readonly onSubscribe: () => Promise<void>) {
    super();
  }

  override async subscribe(handler: MessageHandler): Promise<void> {
    await this.onSubscribe();
    super.subscribe(handler);
  }
}

class FakeLLMClient implements LLMClient {
  readonly requests: Array<Parameters<LLMClient["chat"]>[0]> = [];

  constructor(private readonly response = {}) {}

  async chat(params: Parameters<LLMClient["chat"]>[0]) {
    this.requests.push(params);
    return this.response;
  }
}

class QueueLLMClient implements LLMClient {
  readonly requests: Array<Parameters<LLMClient["chat"]>[0]> = [];

  constructor(private readonly responses: Array<{ text?: string; toolCalls?: ToolCall[] }>) {}

  async chat(params: Parameters<LLMClient["chat"]>[0]) {
    this.requests.push(params);
    return this.responses.shift() ?? {};
  }
}
