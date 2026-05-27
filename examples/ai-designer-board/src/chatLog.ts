import type { ToolCall } from "agent-remote-core";

export type ChatRole = "user" | "assistant" | "tool" | "system";

export interface ChatLogItem {
  id: string;
  role: ChatRole;
  title: string;
  content: string;
  status?: "pending" | "success" | "error";
}

export function createUserChatItem(id: string, content: string): ChatLogItem {
  return { id, role: "user", title: "你", content };
}

export function createAssistantChatItem(id: string, content: string): ChatLogItem {
  return { id, role: "assistant", title: "AI 设计师", content };
}

export function createToolStartChatItem(id: string, call: ToolCall): ChatLogItem {
  return {
    id,
    role: "tool",
    title: `调用工具: ${call.name}`,
    content: summarizeValue(call.arguments),
    status: "pending"
  };
}

export function createToolResultChatItem(id: string, name: string, result: unknown): ChatLogItem {
  return {
    id,
    role: "tool",
    title: `工具完成: ${name}`,
    content: summarizeValue(result),
    status: "success"
  };
}

export function completeToolChatItem(items: ChatLogItem[], pendingId: string, result: unknown): ChatLogItem[] {
  return items.map((item) =>
    item.id === pendingId
      ? {
          ...item,
          title: item.title.replace("调用工具:", "工具完成:"),
          content: result === undefined ? item.content : summarizeValue(result),
          status: "success"
        }
      : item
  );
}

export function failToolChatItem(items: ChatLogItem[], pendingId: string, error: string): ChatLogItem[] {
  return items.map((item) =>
    item.id === pendingId
      ? {
          ...item,
          title: item.title.replace("调用工具:", "工具失败:"),
          content: error,
          status: "error"
        }
      : item
  );
}

export function canSendPrompt(input: { agentStatus?: string; isBusy: boolean; text: string }): boolean {
  return input.agentStatus === "connected" && !input.isBusy && input.text.trim().length > 0;
}

export function createSystemChatItem(id: string, content: string, status: "pending" | "success" | "error" = "pending"): ChatLogItem {
  return { id, role: "system", title: "系统", content, status };
}

export function summarizeValue(value: unknown): string {
  if (value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value.length > 220 ? `${value.slice(0, 220)}...` : value;
  }

  const json = JSON.stringify(value, null, 2);
  return json.length > 360 ? `${json.slice(0, 360)}...` : json;
}
