import { useEffect, useRef, useState } from "react";
import type { BrowserAgentClient, ToolHandler } from "@agent-remote/client";
import type { ErrorMessage, ToolDefinition } from "@agent-remote/core";

export interface UseAgentClientOptions {
  enabled?: boolean;
  autoConnect?: boolean;
  disconnectOnUnmount?: boolean;
}

export type AgentClientStatus = "idle" | "connecting" | "connected" | "disconnected" | "error";

export type AgentClientError = ErrorMessage | Error;

export interface AgentClientState<TClient extends BrowserAgentClient> {
  readonly client: TClient;
  readonly status: AgentClientStatus;
  readonly lastMessage: string | null;
  readonly error: AgentClientError | null;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  sendMessage(text: string): Promise<void>;
  registerTool(definition: ToolDefinition, handler: ToolHandler): void;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

export function createAgentClientState<TClient extends BrowserAgentClient>(
  client: TClient,
  options: UseAgentClientOptions = {}
): AgentClientState<TClient> | null {
  if (options.enabled === false) {
    return null;
  }

  let status: AgentClientStatus = "idle";
  let lastMessage: string | null = null;
  let error: AgentClientError | null = null;
  const listeners = new Set<() => void>();
  const unsubscribeClientMessage = client.on("message", (message) => {
    lastMessage = message;
    notify();
  });
  const unsubscribeClientError = client.on("error", (clientError) => {
    status = "error";
    error = clientError;
    notify();
  });
  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    get client() {
      return client;
    },
    get status() {
      return status;
    },
    get lastMessage() {
      return lastMessage;
    },
    get error() {
      return error;
    },
    async connect() {
      status = "connecting";
      notify();

      try {
        await client.connect();
        status = "connected";
        error = null;
      } catch (connectError) {
        status = "error";
        error = connectError instanceof Error ? connectError : new Error(String(connectError));
        throw connectError;
      } finally {
        notify();
      }
    },
    async disconnect() {
      await client.disconnect();
      status = "disconnected";
      notify();
    },
    async sendMessage(text: string) {
      await client.sendUserMessage(text);
    },
    registerTool(definition: ToolDefinition, handler: ToolHandler) {
      client.registry.register(definition, handler);
    },
    subscribe(listener: () => void) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      unsubscribeClientMessage();
      unsubscribeClientError();
      listeners.clear();
    }
  };
}

export function useAgentClient<TClient extends BrowserAgentClient>(
  createClient: () => TClient,
  options: UseAgentClientOptions = {}
): AgentClientState<TClient> | null {
  const stateRef = useRef<AgentClientState<TClient> | null>(null);

  if (options.enabled === false) {
    stateRef.current = null;
  } else if (!stateRef.current) {
    stateRef.current = createAgentClientState(createClient(), options);
  }

  const state = stateRef.current;
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    if (!state) {
      return undefined;
    }

    const unsubscribe = state.subscribe(() => forceUpdate((version) => version + 1));

    return () => {
      unsubscribe();
      state.dispose();
    };
  }, [state]);

  useEffect(() => {
    if (!state || !options.autoConnect) {
      return undefined;
    }

    void state.connect();

    return () => {
      if (options.disconnectOnUnmount) {
        void state.disconnect();
      }
    };
  }, [state, options.autoConnect, options.disconnectOnUnmount]);

  return state;
}
