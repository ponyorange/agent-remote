import {
  createAssistantMessage,
  createToolCallMessage,
  normalizeToolDefinition,
  type ProtocolMessage,
  type ToolCall,
  type ToolDefinition,
  type ToolResult,
  type TransportConnection
} from "@agent-remote/core";

export interface ChatMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  messageId?: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface SessionData {
  tools: ToolDefinition[];
  messages: ChatMessage[];
}

export interface SessionStore {
  get(sessionId: string): Promise<SessionData | null>;
  set(sessionId: string, data: SessionData): Promise<void>;
  delete(sessionId: string): Promise<void>;
}

export type MessageHandler = (
  sessionId: string,
  message: ProtocolMessage,
  sourceId?: string
) => void | Promise<void>;

export interface MessageBroker {
  publish(sessionId: string, message: ProtocolMessage, sourceId?: string): Promise<void>;
  subscribe(handler: MessageHandler): void | Promise<void>;
}

export interface SessionAuthContext {
  sessionId: string;
  token?: string;
  request?: unknown;
}

export interface SessionAuth {
  verifySession(context: SessionAuthContext): boolean | Promise<boolean>;
}

export interface LLMRequest {
  messages: ChatMessage[];
  tools: ToolDefinition[];
}

export interface LLMResponse {
  text?: string;
  toolCalls?: ToolCall[];
}

export interface LLMClient {
  chat(params: LLMRequest): Promise<LLMResponse>;
}

export interface ToolPolicy {
  filterTools(sessionId: string, tools: ToolDefinition[]): ToolDefinition[] | Promise<ToolDefinition[]>;
}

export interface AgentEngineObserver {
  onLLMRequest?(sessionId: string, request: LLMRequest): void;
  onLLMResponse?(sessionId: string, response: LLMResponse): void;
  onToolCall?(sessionId: string, call: ToolCall): void;
  onProtocolDrop?(sessionId: string, reason: string, payload?: unknown): void;
}

export interface AgentEngineOptions {
  llmClient: LLMClient;
  sessionManager: SessionManager;
  maxSearchResults?: number;
  toolPolicy?: ToolPolicy;
  observer?: AgentEngineObserver;
}

export interface OpenAILLMClientOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
}

export interface TransportHandle {
  readonly sessionId: string;
  readonly id: symbol;
}

const SEARCH_TOOLS_DEFINITION: ToolDefinition = {
  name: "search_tools",
  description: "Search registered browser tools by name, description, domain, or tags.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string" },
      maxResults: { type: "number" }
    },
    required: ["query"]
  },
  level: "L1",
  domain: "agent_remote"
};

export class InMemoryStore implements SessionStore {
  private readonly sessions = new Map<string, SessionData>();

  async get(sessionId: string): Promise<SessionData | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async set(sessionId: string, data: SessionData): Promise<void> {
    this.sessions.set(sessionId, data);
  }

  async delete(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }
}

export class LocalBroker implements MessageBroker {
  private readonly handlers = new Set<MessageHandler>();

  async publish(sessionId: string, message: ProtocolMessage, sourceId?: string): Promise<void> {
    await Promise.all([...this.handlers].map((handler) => handler(sessionId, message, sourceId)));
  }

  subscribe(handler: MessageHandler): void {
    this.handlers.add(handler);
  }
}

export class SessionManager {
  private readonly connections = new Map<string, Map<symbol, TransportConnection>>();
  private readonly readyPromise: Promise<void>;
  private readonly instanceId = `session-manager-${Math.random().toString(36).slice(2)}`;

  constructor(
    private readonly store: SessionStore = new InMemoryStore(),
    private readonly broker: MessageBroker = new LocalBroker()
  ) {
    this.readyPromise = Promise.resolve(this.broker.subscribe(async (sessionId, message, sourceId) => {
      if (sourceId === this.instanceId) {
        return;
      }

      await this.sendToLocalSession(sessionId, message);
    })).then(() => undefined);
  }

  async ready(): Promise<void> {
    await this.readyPromise;
  }

  async getData(sessionId: string): Promise<SessionData | null> {
    return this.store.get(sessionId);
  }

  async saveData(sessionId: string, data: SessionData): Promise<void> {
    await this.store.set(sessionId, data);
  }

  async registerTools(sessionId: string, tools: ToolDefinition[]): Promise<SessionData> {
    const existing = await this.store.get(sessionId);
    const next: SessionData = {
      tools: tools.map(normalizeToolDefinition),
      messages: existing?.messages ?? []
    };

    await this.store.set(sessionId, next);
    return next;
  }

  attachTransport(sessionId: string, transport: TransportConnection): TransportHandle {
    const id = Symbol(sessionId);
    const transports = this.connections.get(sessionId) ?? new Map<symbol, TransportConnection>();
    transports.set(id, transport);
    this.connections.set(sessionId, transports);
    return { sessionId, id };
  }

  detachTransport(sessionId: string, handle?: TransportHandle): void {
    if (!handle) {
      this.connections.delete(sessionId);
      return;
    }

    const transports = this.connections.get(sessionId);
    transports?.delete(handle.id);

    if (transports?.size === 0) {
      this.connections.delete(sessionId);
    }
  }

  async sendToSession(sessionId: string, message: ProtocolMessage): Promise<void> {
    await this.ready();

    await this.sendToLocalSession(sessionId, message);
    await this.broker.publish(sessionId, message, this.instanceId);
  }

  private async sendToLocalSession(
    sessionId: string,
    message: ProtocolMessage
  ): Promise<boolean> {
    const connections = this.connections.get(sessionId);

    if (!connections || connections.size === 0) {
      return false;
    }

    await Promise.all([...connections.values()].map((connection) => connection.send(message)));
    return true;
  }
}

export class AgentEngine {
  private readonly maxSearchResults: number;
  readonly sessionManager: SessionManager;

  constructor(private readonly options: AgentEngineOptions) {
    this.maxSearchResults = options.maxSearchResults ?? 5;
    this.sessionManager = options.sessionManager;
  }

  async handleRegisterTools(sessionId: string, tools: ToolDefinition[]): Promise<void> {
    const allowedTools = this.options.toolPolicy
      ? await this.options.toolPolicy.filterTools(sessionId, tools)
      : tools;
    await this.options.sessionManager.registerTools(sessionId, allowedTools);
  }

  async handleUserMessage(sessionId: string, text: string, messageId?: string): Promise<void> {
    const data = await this.readSession(sessionId);

    if (
      messageId &&
      data.messages.some((message) => message.role === "user" && message.messageId === messageId)
    ) {
      return;
    }

    data.messages.push({ role: "user", content: text, ...(messageId ? { messageId } : {}) });
    await this.options.sessionManager.saveData(sessionId, data);
    await this.runLLM(sessionId, data);
  }

  async handleToolResult(sessionId: string, result: ToolResult): Promise<void> {
    const data = await this.readSession(sessionId);

    if (data.messages.some((message) => message.role === "tool" && message.toolCallId === result.callId)) {
      return;
    }

    data.messages.push({ role: "tool", toolCallId: result.callId, content: JSON.stringify(result) });
    await this.options.sessionManager.saveData(sessionId, data);
    await this.runLLM(sessionId, data);
  }

  private async runLLM(sessionId: string, data: SessionData): Promise<void> {
    const request = {
      messages: [...data.messages],
      tools: this.createVisibleTools(data.tools)
    };
    this.options.observer?.onLLMRequest?.(sessionId, request);
    const response = await this.options.llmClient.chat(request);
    this.options.observer?.onLLMResponse?.(sessionId, response);

    const searchToolCalls = response.toolCalls?.filter((call) => call.name === "search_tools") ?? [];

    if (searchToolCalls.length > 0) {
      data.messages.push({ role: "assistant", content: "", toolCalls: searchToolCalls });

      for (const call of searchToolCalls) {
        data.messages.push({
          role: "tool",
          toolCallId: call.callId,
          content: JSON.stringify({
            callId: call.callId,
            ok: true,
            result: this.searchTools(data.tools, call.arguments)
          })
        });
      }

      await this.options.sessionManager.saveData(sessionId, data);
      await this.runLLM(sessionId, data);
      return;
    }

    if (response.toolCalls && response.toolCalls.length > 0) {
      data.messages.push({ role: "assistant", content: "", toolCalls: response.toolCalls });
      await this.options.sessionManager.saveData(sessionId, data);
    }

    for (const call of response.toolCalls ?? []) {
      this.options.observer?.onToolCall?.(sessionId, call);
      await this.options.sessionManager.sendToSession(sessionId, createToolCallMessage(call));
    }

    if (response.text !== undefined) {
      data.messages.push({ role: "assistant", content: response.text });
      await this.options.sessionManager.saveData(sessionId, data);
      await this.options.sessionManager.sendToSession(sessionId, createAssistantMessage(response.text));
    }
  }

  private async readSession(sessionId: string): Promise<SessionData> {
    return (await this.options.sessionManager.getData(sessionId)) ?? { tools: [], messages: [] };
  }

  private searchTools(tools: ToolDefinition[], args: unknown): ToolDefinition[] {
    const query = readSearchQuery(args).toLowerCase();
    const maxResults = readSearchMaxResults(args, this.maxSearchResults);

    if (!query) {
      return tools.slice(0, maxResults);
    }

    return tools
      .filter((tool) =>
        [tool.name, tool.description, tool.domain, ...(tool.tags ?? [])]
          .filter((value): value is string => typeof value === "string")
          .some((value) => value.toLowerCase().includes(query))
      )
      .slice(0, maxResults);
  }

  private createVisibleTools(tools: ToolDefinition[]): ToolDefinition[] {
    const visibleTools = tools.filter((tool) => (tool.level ?? "L1") === "L1");
    return [...visibleTools, SEARCH_TOOLS_DEFINITION];
  }
}

export class OpenAILLMClient implements LLMClient {
  private readonly fetchImpl: (url: string, init?: RequestInit) => Promise<Response>;
  private readonly baseUrl: string;

  constructor(private readonly options: OpenAILLMClientOptions) {
    this.fetchImpl = options.fetch ?? globalThis.fetch?.bind(globalThis);
    this.baseUrl = options.baseUrl ?? "https://api.openai.com/v1";

    if (!this.fetchImpl) {
      throw new Error("OpenAILLMClient requires fetch.");
    }
  }

  async chat(params: LLMRequest): Promise<LLMResponse> {
    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: this.options.model,
        messages: params.messages.map(toOpenAIMessage),
        tools: params.tools.map(toOpenAITool)
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI chat completion failed with status ${response.status}.`);
    }

    const body = (await response.json()) as unknown;
    return readOpenAIResponse(body);
  }
}

function readSearchQuery(args: unknown): string {
  return isRecord(args) && typeof args.query === "string" ? args.query : "";
}

function readSearchMaxResults(args: unknown, fallback: number): number {
  return isRecord(args) && typeof args.maxResults === "number" && args.maxResults > 0
    ? Math.floor(args.maxResults)
    : fallback;
}

function readOpenAIResponse(body: unknown): LLMResponse {
  if (!isRecord(body) || !Array.isArray(body.choices)) {
    return {};
  }

  const [choice] = body.choices;

  if (!isRecord(choice) || !isRecord(choice.message)) {
    return {};
  }

  if (Array.isArray(choice.message.tool_calls)) {
    const toolCalls = choice.message.tool_calls.flatMap(readOpenAIToolCall);
    return toolCalls.length > 0 ? { toolCalls } : {};
  }

  return typeof choice.message.content === "string" ? { text: choice.message.content } : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toOpenAITool(tool: ToolDefinition): unknown {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  };
}

function toOpenAIMessage(message: ChatMessage): unknown {
  if (message.role === "assistant" && message.toolCalls && message.toolCalls.length > 0) {
    return {
      role: "assistant",
      content: message.content.length > 0 ? message.content : null,
      tool_calls: message.toolCalls.map(toOpenAIToolCall)
    };
  }

  if (message.role === "tool") {
    return {
      role: "tool",
      tool_call_id: message.toolCallId,
      content: message.content
    };
  }

  return {
    role: message.role,
    content: message.content
  };
}

function toOpenAIToolCall(call: ToolCall): unknown {
  return {
    id: call.callId,
    type: "function",
    function: {
      name: call.name,
      arguments: JSON.stringify(call.arguments ?? {})
    }
  };
}

function readOpenAIToolCall(input: unknown): ToolCall[] {
  if (!isRecord(input) || !isRecord(input.function)) {
    return [];
  }

  const id = input.id;
  const name = input.function.name;

  if (typeof id !== "string" || typeof name !== "string") {
    return [];
  }

  return [
    {
      callId: id,
      name,
      arguments: parseToolArguments(input.function.arguments)
    }
  ];
}

function parseToolArguments(input: unknown): unknown {
  if (typeof input !== "string" || input.length === 0) {
    return {};
  }

  try {
    return JSON.parse(input) as unknown;
  } catch {
    return input;
  }
}
