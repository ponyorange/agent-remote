import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createSSEClient } from "agent-remote-client/sse";
import { useAgentClient } from "agent-remote-react";
import type { ToolCall, ToolDefinition } from "agent-remote-core";
import { boardReducer, createInitialBoardState, summarizeBoard } from "./boardState";
import { DesignerBoard, type DesignerBoardHandle } from "./DesignerBoard";
import { SAMPLE_PROMPTS } from "./samplePrompts";
import {
  type ChatLogItem,
  canSendPrompt,
  completeToolChatItem,
  createAssistantChatItem,
  createSystemChatItem,
  createToolStartChatItem,
  createUserChatItem,
  failToolChatItem
} from "./chatLog";
import { dequeueConfirmation, enqueueConfirmation } from "./confirmationQueue";
import { createDesignerTools } from "./tools";
import "./styles.css";

interface ActivityItem {
  id: string;
  text: string;
}

interface PendingConfirmation {
  tool: ToolDefinition;
  call: ToolCall;
  resolve(accepted: boolean): void;
}

export function App() {
  const [boardState, dispatch] = useReducer(boardReducer, undefined, () => createInitialBoardState());
  const boardStateRef = useRef(boardState);
  const boardRef = useRef<DesignerBoardHandle>(null);
  const [prompt, setPrompt] = useState<string>(SAMPLE_PROMPTS[0]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatLogItem[]>([
    createSystemChatItem("welcome", "输入设计需求后，AI 会在这里展示回复、工具调用和执行结果。", "success")
  ]);
  const [isThinking, setIsThinking] = useState(false);
  const [runningToolCount, setRunningToolCount] = useState(0);
  const [pendingConfirmations, setPendingConfirmations] = useState<PendingConfirmation[]>([]);

  useEffect(() => {
    boardStateRef.current = boardState;
  }, [boardState]);

  const createClient = useCallback(
    () =>
      createSSEClient(
        {
          kind: "sse",
          sseUrl: "/sse",
          sessionId: crypto.randomUUID(),
          retryAttempts: 1,
          postUrls: {
            registerTools: "/api/register_tools",
            sendMessage: "/api/chat",
            toolResult: "/api/tool_result"
          }
        },
        undefined,
        {
          confirmToolCall: (tool, call) =>
            new Promise<boolean>((resolve) => {
              setPendingConfirmations((items) => enqueueConfirmation(items, { tool, call, resolve }));
            })
        }
      ),
    []
  );
  const agent = useAgentClient(createClient, { disconnectOnUnmount: true });
  const pendingConfirmation = pendingConfirmations[0] ?? null;
  const isWorking = isThinking || runningToolCount > 0 || Boolean(pendingConfirmation);
  const isReady = agent?.status === "connected";
  const canSubmitPrompt = canSendPrompt({ agentStatus: agent?.status, isBusy: isWorking, text: prompt });

  const appendChatMessage = useCallback((message: ChatLogItem) => {
    setChatMessages((messages) => [...messages, message].slice(-40));
  }, []);

  const tools = useMemo(
    () =>
      createDesignerTools({
        getState: () => boardStateRef.current,
        dispatch: (action) => {
          const nextState = boardReducer(boardStateRef.current, action);
          boardStateRef.current = nextState;
          dispatch(action);
          setActivities((items) => prependActivity(items, `工具执行: ${action.type}`));
          return nextState;
        },
        exportCanvas: async () => {
          const dataUrl = boardRef.current?.exportPng() ?? "";
          downloadDataUrl(dataUrl, "ai-designer-board.png");
          return dataUrl;
        }
      }),
    []
  );

  useEffect(() => {
    if (!agent) {
      return undefined;
    }

    return agent.client.on("message", (message) => {
      setIsThinking(false);
      appendChatMessage(createAssistantChatItem(createId("assistant"), message));
    });
  }, [agent, appendChatMessage]);

  useEffect(() => {
    if (!agent?.error) {
      return;
    }

    setIsThinking(false);
    setRunningToolCount(0);
    appendChatMessage(createSystemChatItem(createId("error"), "message" in agent.error ? agent.error.message : String(agent.error), "error"));
  }, [agent?.error, appendChatMessage]);

  useEffect(() => {
    for (const tool of tools) {
      agent?.registerTool(tool.definition, async (args) => {
        setIsThinking(false);
        setRunningToolCount((count) => count + 1);
        const call: ToolCall = { callId: createId("local-tool"), name: tool.definition.name, arguments: args };
        const toolMessageId = createId("tool-start");
        appendChatMessage(createToolStartChatItem(toolMessageId, call));
        setActivities((items) => prependActivity(items, `调用工具: ${tool.definition.name}`));
        try {
          const result = await tool.handler(args);
          setChatMessages((messages) => completeToolChatItem(messages, toolMessageId, result));
          return result;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setChatMessages((messages) => failToolChatItem(messages, toolMessageId, message));
          appendChatMessage(
            createSystemChatItem(
              createId("tool-error"),
              `${tool.definition.name} 执行失败：${message}`,
              "error"
            )
          );
          throw error;
        } finally {
          setRunningToolCount((count) => Math.max(0, count - 1));
          setIsThinking(true);
        }
      });
    }
    void agent?.connect().catch(() => {
      // useAgentClient already stores the connection error for UI rendering.
    });
  }, [agent, tools, appendChatMessage]);

  async function sendPrompt(text = prompt) {
    if (!agent || !canSendPrompt({ agentStatus: agent.status, isBusy: isWorking, text })) {
      return;
    }
    appendChatMessage(createUserChatItem(createId("user"), text));
    setIsThinking(true);
    setActivities((items) => prependActivity(items, `用户: ${text}`));
    try {
      await agent.sendMessage(text);
    } catch (error) {
      setIsThinking(false);
      const message = error instanceof Error ? error.message : String(error);
      appendChatMessage(createSystemChatItem(createId("send-error"), `发送失败：${message}`, "error"));
      setActivities((items) => prependActivity(items, `发送失败: ${message}`));
    }
  }

  function answerConfirmation(accepted: boolean) {
    const { current, remaining } = dequeueConfirmation(pendingConfirmations);
    current?.resolve(accepted);
    setActivities((items) => prependActivity(items, accepted ? "已确认高风险工具" : "已拒绝高风险工具"));
    setPendingConfirmations(remaining);
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Agent Remote Demo</p>
          <h1>AI 设计师实时协作画板</h1>
          <p>后端 DeepSeek 负责思考，浏览器工具负责动手。你可以看到 Agent 直接创建、排版、撤销和导出画板内容。</p>
        </div>
        <div className="status-card">
          <span>连接状态</span>
          <strong>{agent?.status ?? "disabled"}</strong>
          <small>{agent?.lastMessage ?? "等待助手回复"}</small>
        </div>
      </section>

      <section className="workspace">
        <DesignerBoard
          ref={boardRef}
          state={boardState}
          onMove={(id, x, y) => dispatch({ type: "moveElement", id, x, y })}
          onSelect={(ids) => dispatch({ type: "selectElements", ids })}
        />

        <aside className="side-panel">
          <h2>和 AI 设计师对话</h2>
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={6} />
          <button type="button" className="primary" onClick={() => void sendPrompt()} disabled={!canSubmitPrompt}>
            {!isReady ? "正在连接 Agent..." : isWorking ? "AI 正在操作..." : "发送给 Agent"}
          </button>

          <div className={`agent-progress ${!isReady || isWorking ? "active" : ""}`}>
            <span className="pulse-dot" />
            {!isReady
              ? "正在连接并注册浏览器工具"
              : pendingConfirmation
              ? "等待你确认高风险工具"
              : runningToolCount > 0
                ? `正在执行 ${runningToolCount} 个浏览器工具`
                : isThinking
                  ? "AI 正在思考下一步"
                  : "空闲"}
          </div>

          <div className="prompt-list">
            {SAMPLE_PROMPTS.map((sample) => (
              <button
                key={sample}
                type="button"
                disabled={!canSendPrompt({ agentStatus: agent?.status, isBusy: isWorking, text: sample })}
                onClick={() => {
                  setPrompt(sample);
                  void sendPrompt(sample);
                }}
              >
                {sample}
              </button>
            ))}
          </div>

          <h3>聊天窗口</h3>
          <ol className="chat-list">
            {chatMessages.map((item) => (
              <li key={item.id} className={`chat-item ${item.role} ${item.status ?? ""}`}>
                <strong>{item.title}</strong>
                <p>{item.content}</p>
              </li>
            ))}
          </ol>

          <h3>画板摘要</h3>
          <pre>{JSON.stringify(summarizeBoard(boardState), null, 2)}</pre>

          <h3>活动日志</h3>
          <ul className="activity-list">
            {activities.map((item) => (
              <li key={item.id}>{item.text}</li>
            ))}
          </ul>
        </aside>
      </section>

      {pendingConfirmation ? (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>确认浏览器操作</h2>
            <p>Agent 请求执行高风险工具：{pendingConfirmation.tool.name}</p>
            <pre>{JSON.stringify(pendingConfirmation.call.arguments, null, 2)}</pre>
            <div className="modal-actions">
              <button type="button" onClick={() => answerConfirmation(false)}>
                拒绝
              </button>
              <button type="button" className="primary" onClick={() => answerConfirmation(true)}>
                确认执行
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function prependActivity(items: ActivityItem[], text: string): ActivityItem[] {
  return [{ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, text }, ...items].slice(0, 12);
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function downloadDataUrl(dataUrl: string, filename: string): void {
  if (!dataUrl) {
    throw new Error("Canvas export returned an empty data URL.");
  }
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}
