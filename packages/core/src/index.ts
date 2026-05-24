export const AGENT_REMOTE_PROTOCOL_PREFIX = "agent_remote:";

export const PROTOCOL_MESSAGE_TYPES = {
  registerTools: "agent_remote:register_tools",
  toolCall: "agent_remote:tool_call",
  toolResult: "agent_remote:tool_result",
  userMessage: "agent_remote:user_message",
  assistantMessage: "agent_remote:assistant_message",
  error: "agent_remote:error"
} as const;

export type ToolLevel = "L1" | "L2" | "L3";

export type ToolRisk = "low" | "medium" | "high";

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue;
}

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

export type AgentRemoteMessageType = `${typeof AGENT_REMOTE_PROTOCOL_PREFIX}${string}`;

export type ProtocolMessageType =
  (typeof PROTOCOL_MESSAGE_TYPES)[keyof typeof PROTOCOL_MESSAGE_TYPES];

export interface AgentRemoteEnvelope {
  type: AgentRemoteMessageType;
  [key: string]: unknown;
}

export interface RegisterToolsMessage {
  type: typeof PROTOCOL_MESSAGE_TYPES.registerTools;
  tools: ToolDefinition[];
}

export interface ToolCallMessage extends ToolCall {
  type: typeof PROTOCOL_MESSAGE_TYPES.toolCall;
}

export interface ToolResultMessage extends ToolResult {
  type: typeof PROTOCOL_MESSAGE_TYPES.toolResult;
}

export interface UserMessage {
  type: typeof PROTOCOL_MESSAGE_TYPES.userMessage;
  text: string;
}

export interface AssistantMessage {
  type: typeof PROTOCOL_MESSAGE_TYPES.assistantMessage;
  text: string;
}

export interface ErrorMessage {
  type: typeof PROTOCOL_MESSAGE_TYPES.error;
  message: string;
  code?: string;
}

export type ProtocolMessage =
  | RegisterToolsMessage
  | ToolCallMessage
  | ToolResultMessage
  | UserMessage
  | AssistantMessage
  | ErrorMessage;

export interface TransportConnection {
  send(message: ProtocolMessage): void | Promise<void>;
  onMessage(handler: (message: unknown) => void): void;
  close(): void | Promise<void>;
}

export interface ValidationIssue {
  path: string;
  message: string;
  keyword?: string;
}

export type ValidationResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      errors: ValidationIssue[];
    };

export function isAgentRemoteMessage(message: unknown): message is AgentRemoteEnvelope {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    typeof message.type === "string" &&
    message.type.startsWith(AGENT_REMOTE_PROTOCOL_PREFIX)
  );
}

export function normalizeToolDefinition(definition: ToolDefinition): ToolDefinition {
  return {
    ...definition,
    level: definition.level ?? "L1"
  };
}

export function validateToolDefinition(input: unknown): ValidationResult<ToolDefinition> {
  if (!isRecord(input)) {
    return {
      ok: false,
      errors: [createValidationIssue("/", "tool definition must be an object")]
    };
  }

  const errors: ValidationIssue[] = [];
  requireNonEmptyString(input, "name", errors);
  requireNonEmptyString(input, "description", errors);

  if (!isRecord(input.parameters)) {
    errors.push(createValidationIssue("/parameters", "parameters must be an object"));
  }

  if (input.level !== undefined && !isToolLevel(input.level)) {
    errors.push(createValidationIssue("/level", "level must be one of L1, L2, L3"));
  }

  if (input.risk !== undefined && !isToolRisk(input.risk)) {
    errors.push(createValidationIssue("/risk", "risk must be one of low, medium, high"));
  }

  if (input.domain !== undefined && !isNonEmptyString(input.domain)) {
    errors.push(createValidationIssue("/domain", "domain must be a non-empty string"));
  }

  if (
    input.tags !== undefined &&
    (!Array.isArray(input.tags) || !input.tags.every(isNonEmptyString))
  ) {
    errors.push(createValidationIssue("/tags", "tags must be an array of non-empty strings"));
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors
    };
  }

  return {
    ok: true,
    value: normalizeToolDefinition(input as unknown as ToolDefinition)
  };
}

export function validateProtocolMessage(input: unknown): ValidationResult<ProtocolMessage> {
  if (!isRecord(input)) {
    return {
      ok: false,
      errors: [createValidationIssue("/", "protocol message must be an object")]
    };
  }

  if (!isKnownProtocolMessageType(input.type)) {
    return {
      ok: false,
      errors: [createValidationIssue("/type", "type must be a known agent_remote message type")]
    };
  }

  const errors = validateProtocolMessageShape(input);

  if (input.type === PROTOCOL_MESSAGE_TYPES.registerTools && Array.isArray(input.tools)) {
    errors.push(
      ...input.tools.flatMap((tool, index) => {
      const result = validateToolDefinition(tool);
      return result.ok
        ? []
        : result.errors.map((error) => ({
            ...error,
            path: `/tools/${index}${error.path}`
          }));
      })
    );
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors
    };
  }

  return {
    ok: true,
    value: input as unknown as ProtocolMessage
  };
}

export function createProtocolMessage(message: ProtocolMessage): ProtocolMessage {
  const result = validateProtocolMessage(message);

  if (!result.ok) {
    throw new Error(formatValidationErrors(result.errors));
  }

  return result.value;
}

export function createRegisterToolsMessage(tools: ToolDefinition[]): RegisterToolsMessage {
  return createProtocolMessage({
    type: PROTOCOL_MESSAGE_TYPES.registerTools,
    tools
  }) as RegisterToolsMessage;
}

export function createToolCallMessage(call: ToolCall): ToolCallMessage {
  return createProtocolMessage({
    type: PROTOCOL_MESSAGE_TYPES.toolCall,
    ...call
  }) as ToolCallMessage;
}

export function createToolResultMessage(result: ToolResult): ToolResultMessage {
  return createProtocolMessage({
    type: PROTOCOL_MESSAGE_TYPES.toolResult,
    ...result
  }) as ToolResultMessage;
}

export function createUserMessage(text: string): UserMessage {
  return createProtocolMessage({
    type: PROTOCOL_MESSAGE_TYPES.userMessage,
    text
  }) as UserMessage;
}

export function createAssistantMessage(text: string): AssistantMessage {
  return createProtocolMessage({
    type: PROTOCOL_MESSAGE_TYPES.assistantMessage,
    text
  }) as AssistantMessage;
}

export function createErrorMessage(message: string, code?: string): ErrorMessage {
  return createProtocolMessage({
    type: PROTOCOL_MESSAGE_TYPES.error,
    message,
    ...(code ? { code } : {})
  }) as ErrorMessage;
}

function formatValidationErrors(errors: ValidationIssue[]): string {
  return errors.map((error) => `${error.path}: ${error.message}`).join("; ");
}

function validateProtocolMessageShape(message: Record<string, unknown>): ValidationIssue[] {
  const errors: ValidationIssue[] = [];

  switch (message.type) {
    case PROTOCOL_MESSAGE_TYPES.registerTools:
      if (!Array.isArray(message.tools)) {
        errors.push(createValidationIssue("/tools", "tools must be an array"));
      }
      break;
    case PROTOCOL_MESSAGE_TYPES.toolCall:
      requireNonEmptyString(message, "callId", errors);
      requireNonEmptyString(message, "name", errors);
      if (!("arguments" in message)) {
        errors.push(createValidationIssue("/arguments", "arguments is required"));
      }
      break;
    case PROTOCOL_MESSAGE_TYPES.toolResult:
      requireNonEmptyString(message, "callId", errors);
      if (typeof message.ok !== "boolean") {
        errors.push(createValidationIssue("/ok", "ok must be a boolean"));
      }
      if (message.error !== undefined && typeof message.error !== "string") {
        errors.push(createValidationIssue("/error", "error must be a string"));
      }
      break;
    case PROTOCOL_MESSAGE_TYPES.userMessage:
    case PROTOCOL_MESSAGE_TYPES.assistantMessage:
      if (typeof message.text !== "string") {
        errors.push(createValidationIssue("/text", "text must be a string"));
      }
      break;
    case PROTOCOL_MESSAGE_TYPES.error:
      requireNonEmptyString(message, "message", errors);
      if (message.code !== undefined && !isNonEmptyString(message.code)) {
        errors.push(createValidationIssue("/code", "code must be a non-empty string"));
      }
      break;
  }

  return errors;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function isNonEmptyString(input: unknown): input is string {
  return typeof input === "string" && input.length > 0;
}

function isToolLevel(input: unknown): input is ToolLevel {
  return input === "L1" || input === "L2" || input === "L3";
}

function isToolRisk(input: unknown): input is ToolRisk {
  return input === "low" || input === "medium" || input === "high";
}

function isKnownProtocolMessageType(input: unknown): input is ProtocolMessageType {
  return Object.values(PROTOCOL_MESSAGE_TYPES).includes(input as ProtocolMessageType);
}

function requireNonEmptyString(
  object: Record<string, unknown>,
  key: string,
  errors: ValidationIssue[]
): void {
  if (!isNonEmptyString(object[key])) {
    errors.push(createValidationIssue(`/${key}`, `${key} must be a non-empty string`));
  }
}

function createValidationIssue(path: string, message: string): ValidationIssue {
  return { path, message };
}
