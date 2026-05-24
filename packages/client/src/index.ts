import {
  PROTOCOL_MESSAGE_TYPES,
  createRegisterToolsMessage,
  createToolResultMessage,
  createUserMessage,
  normalizeToolDefinition,
  validateProtocolMessage,
  type ErrorMessage,
  type ToolCall,
  type ToolDefinition,
  type ToolResult,
  type TransportConnection
} from "@agent-remote/core";

export type ToolHandler = (args: unknown) => unknown | Promise<unknown>;

export interface BrowserAgentClientEvents {
  message: string;
  error: ErrorMessage;
}

export type BrowserAgentClientEvent = keyof BrowserAgentClientEvents;
export type Unsubscribe = () => void;

interface RegisteredTool {
  definition: ToolDefinition;
  handler: ToolHandler;
}

export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>();

  register(definition: ToolDefinition, handler: ToolHandler): void {
    const normalizedDefinition = normalizeToolDefinition(definition);
    this.tools.set(normalizedDefinition.name, { definition: normalizedDefinition, handler });
  }

  unregister(name: string): void {
    this.tools.delete(name);
  }

  getDefinitions(): ToolDefinition[] {
    return [...this.tools.values()].map((tool) => tool.definition);
  }

  async execute(call: ToolCall): Promise<ToolResult> {
    const tool = this.tools.get(call.name);

    if (!tool) {
      return {
        callId: call.callId,
        ok: false,
        error: `Tool not found: ${call.name}`
      };
    }

    try {
      return {
        callId: call.callId,
        ok: true,
        result: await tool.handler(call.arguments)
      };
    } catch (error) {
      return {
        callId: call.callId,
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}

export class BrowserAgentClient {
  readonly registry = new ToolRegistry();
  private readonly eventHandlers = new Map<
    BrowserAgentClientEvent,
    Set<(data: BrowserAgentClientEvents[BrowserAgentClientEvent]) => void>
  >();

  constructor(readonly transport: TransportConnection) {
    this.transport.onMessage((message) => {
      void this.handleTransportMessage(message);
    });
  }

  async connect(): Promise<void> {
    await this.transport.send(createRegisterToolsMessage(this.registry.getDefinitions()));
  }

  async sendUserMessage(text: string): Promise<void> {
    await this.transport.send(createUserMessage(text));
  }

  on<TEvent extends BrowserAgentClientEvent>(
    event: TEvent,
    handler: (data: BrowserAgentClientEvents[TEvent]) => void
  ): Unsubscribe {
    const handlers = this.eventHandlers.get(event) ?? new Set();
    const listener = handler as (data: BrowserAgentClientEvents[BrowserAgentClientEvent]) => void;
    handlers.add(listener);
    this.eventHandlers.set(event, handlers);

    return () => {
      handlers.delete(listener);
    };
  }

  async disconnect(): Promise<void> {
    await this.transport.close();
    this.eventHandlers.clear();
  }

  private async handleTransportMessage(message: unknown): Promise<void> {
    const result = validateProtocolMessage(message);

    if (!result.ok) {
      return;
    }

    switch (result.value.type) {
      case PROTOCOL_MESSAGE_TYPES.toolCall:
        await this.handleToolCall(result.value);
        break;
      case PROTOCOL_MESSAGE_TYPES.assistantMessage:
        this.emit("message", result.value.text);
        break;
      case PROTOCOL_MESSAGE_TYPES.error:
        this.emit("error", result.value);
        break;
      default:
        break;
    }
  }

  private async handleToolCall(message: ToolCall): Promise<void> {
    const result = await this.registry.execute(message);
    await this.transport.send(createToolResultMessage(result));
  }

  private emit<TEvent extends BrowserAgentClientEvent>(
    event: TEvent,
    data: BrowserAgentClientEvents[TEvent]
  ): void {
    for (const handler of this.eventHandlers.get(event) ?? []) {
      handler(data);
    }
  }
}
