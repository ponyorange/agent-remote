import {
  normalizeToolDefinition,
  type ProtocolMessage,
  type ToolDefinition,
  type TransportConnection
} from "@agent-remote/core";

export interface ChatMessage {
  role: "user" | "assistant" | "tool";
  content: string;
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

export type MessageHandler = (sessionId: string, message: ProtocolMessage) => void | Promise<void>;

export interface MessageBroker {
  publish(sessionId: string, message: ProtocolMessage): Promise<void>;
  subscribe(handler: MessageHandler): void | Promise<void>;
}

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

  async publish(sessionId: string, message: ProtocolMessage): Promise<void> {
    await Promise.all([...this.handlers].map((handler) => handler(sessionId, message)));
  }

  subscribe(handler: MessageHandler): void {
    this.handlers.add(handler);
  }
}

export class SessionManager {
  private readonly connections = new Map<string, TransportConnection>();

  constructor(
    private readonly store: SessionStore = new InMemoryStore(),
    private readonly broker: MessageBroker = new LocalBroker()
  ) {
    void this.broker.subscribe(async (sessionId, message) => {
      await this.sendToLocalSession(sessionId, message);
    });
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

  attachTransport(sessionId: string, transport: TransportConnection): void {
    this.connections.set(sessionId, transport);
  }

  detachTransport(sessionId: string): void {
    this.connections.delete(sessionId);
  }

  async sendToSession(sessionId: string, message: ProtocolMessage): Promise<void> {
    if (await this.sendToLocalSession(sessionId, message)) {
      return;
    }

    await this.broker.publish(sessionId, message);
  }

  private async sendToLocalSession(
    sessionId: string,
    message: ProtocolMessage
  ): Promise<boolean> {
    const connection = this.connections.get(sessionId);

    if (!connection) {
      return false;
    }

    await connection.send(message);
    return true;
  }
}
