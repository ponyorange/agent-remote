import {
  PROTOCOL_MESSAGE_TYPES,
  PROTOCOL_ERROR_CODES,
  createHelloMessage,
  createRegisterToolsMessage,
  createToolResultMessage,
  createUserMessage,
  normalizeToolDefinition,
  validateProtocolMessage,
  type ErrorMessage,
  type ProtocolDropEvent,
  type ToolCall,
  type ToolDefinition,
  type ToolResult,
  type TransportConnection
} from "agent-remote-core";

export type ToolHandler = (args: unknown) => unknown | Promise<unknown>;

export interface BrowserAgentClientOptions {
  confirmToolCall?: (tool: ToolDefinition, call: ToolCall) => boolean | Promise<boolean>;
  onProtocolDrop?: (event: ProtocolDropEvent) => void;
}

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

  getDefinition(name: string): ToolDefinition | null {
    return this.tools.get(name)?.definition ?? null;
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
  private readonly toolCallResults = new Map<string, Promise<ToolResult>>();
  private connectedOnce = false;

  constructor(
    readonly transport: TransportConnection,
    private readonly options: BrowserAgentClientOptions = {}
  ) {
    this.transport.onMessage((message) => {
      void this.handleTransportMessage(message);
    });
    this.transport.onReconnect?.(() => {
      if (this.connectedOnce) {
        void this.connect();
      }
    });
  }

  async connect(): Promise<void> {
    this.connectedOnce = true;
    if (this.transport.supportsHandshake) {
      await this.transport.send(createHelloMessage(["tools"]));
    }
    await this.transport.send(createRegisterToolsMessage(this.registry.getDefinitions()));
  }

  async sendUserMessage(text: string): Promise<void> {
    await this.transport.send(createUserMessage(text, createClientMessageId()));
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
    this.connectedOnce = false;
    await this.transport.close();
    this.eventHandlers.clear();
  }

  private async handleTransportMessage(message: unknown): Promise<void> {
    const result = validateProtocolMessage(message);

    if (!result.ok) {
      if (result.errors.some((error) => error.path === "/protocolVersion")) {
        this.emit("error", {
          type: PROTOCOL_MESSAGE_TYPES.error,
          message: "Incompatible Agent Remote protocol version.",
          code: PROTOCOL_ERROR_CODES.incompatibleProtocol
        });
      }
      this.options.onProtocolDrop?.({
        reason: "invalid_protocol_message",
        message,
        errors: result.errors
      });
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
    const existingResult = this.toolCallResults.get(message.callId);

    if (existingResult) {
      await this.transport.send(createToolResultMessage(await existingResult));
      return;
    }

    const resultPromise = this.executeToolCall(message);
    this.toolCallResults.set(message.callId, resultPromise);
    await this.transport.send(createToolResultMessage(await resultPromise));
  }

  private async executeToolCall(message: ToolCall): Promise<ToolResult> {
    const definition = this.registry.getDefinition(message.name);

    if (definition && shouldConfirmTool(definition)) {
      const accepted = await this.options.confirmToolCall?.(definition, message);

      if (!accepted) {
        const rejectedResult: ToolResult = {
          callId: message.callId,
          ok: false,
          error: "Tool execution rejected by confirmation."
        };
        this.emit("error", {
          type: PROTOCOL_MESSAGE_TYPES.error,
          message: "Tool execution rejected by confirmation.",
          code: PROTOCOL_ERROR_CODES.toolExecutionRejected
        });
        return rejectedResult;
      }
    }

    return this.registry.execute(message);
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

function shouldConfirmTool(definition: ToolDefinition): boolean {
  return definition.risk === "high" || definition.level === "L3";
}

function createClientMessageId(): string {
  const random =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `msg-${random}`;
}
