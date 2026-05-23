import type { ToolCall, ToolDefinition, ToolResult, TransportConnection } from "@agent-remote/core";

export type ToolHandler = (args: unknown) => unknown | Promise<unknown>;

interface RegisteredTool {
  definition: ToolDefinition;
  handler: ToolHandler;
}

export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>();

  register(definition: ToolDefinition, handler: ToolHandler): void {
    this.tools.set(definition.name, { definition, handler });
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

  constructor(readonly transport: TransportConnection) {}

  connect(): void {
    this.transport.send({
      type: "agent_remote:register_tools",
      tools: this.registry.getDefinitions()
    });
  }

  sendUserMessage(text: string): void {
    this.transport.send({
      type: "agent_remote:user_message",
      text
    });
  }

  disconnect(): void {
    this.transport.close();
  }
}
