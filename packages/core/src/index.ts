export const AGENT_REMOTE_PROTOCOL_PREFIX = "agent_remote:";

export type ToolLevel = "L1" | "L2" | "L3";

export type ToolRisk = "low" | "medium" | "high";

export type JsonSchema = {
  [key: string]: unknown;
};

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: JsonSchema;
  level?: ToolLevel;
  risk?: ToolRisk;
  domain?: string;
  tags?: string[];
}

export interface ToolCall {
  callId: string;
  name: string;
  arguments: unknown;
}

export interface ToolResult {
  callId: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface ProtocolMessage {
  type: `${typeof AGENT_REMOTE_PROTOCOL_PREFIX}${string}`;
  [key: string]: unknown;
}

export interface TransportConnection {
  send(message: ProtocolMessage): void | Promise<void>;
  onMessage(handler: (message: unknown) => void): void;
  close(): void | Promise<void>;
}

export function isAgentRemoteMessage(message: unknown): message is ProtocolMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    typeof message.type === "string" &&
    message.type.startsWith(AGENT_REMOTE_PROTOCOL_PREFIX)
  );
}
