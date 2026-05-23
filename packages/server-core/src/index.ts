import type { ToolDefinition } from "@agent-remote/core";

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
}

export class InMemoryStore implements SessionStore {
  private readonly sessions = new Map<string, SessionData>();

  async get(sessionId: string): Promise<SessionData | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async set(sessionId: string, data: SessionData): Promise<void> {
    this.sessions.set(sessionId, data);
  }
}

export class SessionManager {
  constructor(private readonly store: SessionStore = new InMemoryStore()) {}

  async registerTools(sessionId: string, tools: ToolDefinition[]): Promise<SessionData> {
    const existing = await this.store.get(sessionId);
    const next: SessionData = {
      tools,
      messages: existing?.messages ?? []
    };

    await this.store.set(sessionId, next);
    return next;
  }
}
