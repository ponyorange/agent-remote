import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import type { ToolCall, ToolDefinition } from "agent-remote-core";
import {
  AgentEngine,
  InMemoryStore,
  LocalBroker,
  SessionManager,
  type ChatMessage,
  type LLMClient,
  type LLMRequest,
  type LLMResponse
} from "agent-remote-server-core";
import { createExpressAgentRouter } from "agent-remote-server-express";

const DESIGNER_SYSTEM_PROMPT = [
  "You are an AI designer controlling a browser whiteboard through tools.",
  "Prefer tool calls over prose when the user asks to draw, arrange, style, undo, or export.",
  "Call get_canvas_state before edits that depend on current elements.",
  "Use search_tools to discover advanced L2 tools when styling or chart requests need capabilities not visible initially.",
  "Keep explanations concise after tools complete."
].join(" ");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface CreateDesignerAppOptions {
  forceScriptedLLM?: boolean;
}

export class ScriptedDesignerLLMClient implements LLMClient {
  async chat(params: LLMRequest): Promise<LLMResponse> {
    const lastMessage = params.messages.at(-1);
    const hasStyleSearchResult = params.messages.some(
      (message) => message.role === "tool" && message.toolCallId === "script-search-style"
    );
    const hasChartSearchResult = params.messages.some(
      (message) => message.role === "tool" && message.toolCallId === "script-search-chart"
    );
    const hasAppliedL2Tool = params.messages.some(
      (message) =>
        message.role === "tool" &&
        (message.toolCallId === "script-style" || message.toolCallId === "script-chart")
    );

    if (hasStyleSearchResult && hasChartSearchResult && !hasAppliedL2Tool) {
      return {
        toolCalls: [
          toolCall("script-style", "apply_style_preset", { preset: "minimalist" }),
          toolCall("script-chart", "create_chart", {
            id: "chart-progress",
            title: "Design Progress",
            values: [35, 70, 95],
            labels: ["Idea", "Layout", "Polish"],
            x: 620,
            y: 360
          })
        ]
      };
    }
    if (lastMessage?.role === "tool") {
      return { text: "已完成，我已经把画板更新好了。" };
    }

    const userText = [...params.messages].reverse().find((message) => message.role === "user")?.content.toLowerCase() ?? "";
    if (userText.includes("导出") || userText.includes("export")) {
      return { toolCalls: [toolCall("script-export", "export_canvas", { format: "png" })] };
    }
    if (userText.includes("撤销") || userText.includes("undo") || userText.includes("上一步")) {
      return { toolCalls: [toolCall("script-undo", "undo", {})] };
    }
    if (userText.includes("极简") || userText.includes("minimal")) {
      return {
        toolCalls: [
          toolCall("script-search-style", "search_tools", { query: "style", maxResults: 5 }),
          toolCall("script-search-chart", "search_tools", { query: "chart", maxResults: 5 })
        ]
      };
    }
    if (userText.includes("渐变") || userText.includes("gradient") || userText.includes("均匀")) {
      return {
        toolCalls: [
          toolCall("script-gradient", "set_background_gradient", { from: "#111827", to: "#38bdf8" }),
          toolCall("script-arrange", "arrange_evenly", { ids: ["circle-hero", "text-hello"], direction: "horizontal" })
        ]
      };
    }

    return {
      toolCalls: [
        toolCall("script-circle", "create_shape", {
          id: "circle-hero",
          type: "circle",
          x: 480,
          y: 280,
          radius: 100,
          color: "blue"
        }),
        toolCall("script-text", "create_text", {
          id: "text-hello",
          content: "Hello World",
          x: 480,
          y: 430,
          fontSize: 24,
          align: "center"
        })
      ]
    };
  }
}

export class DeepSeekDesignerLLMClient implements LLMClient {
  private readonly fetchImpl: (url: string, init?: RequestInit) => Promise<Response>;

  constructor(
    private readonly options: {
      apiKey: string;
      baseUrl?: string;
      model?: string;
      fetch?: (url: string, init?: RequestInit) => Promise<Response>;
    }
  ) {
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async chat(params: LLMRequest): Promise<LLMResponse> {
    const tools = mergeTools(params.tools, readDiscoveredTools(params.messages));
    const response = await this.fetchImpl(`${this.options.baseUrl ?? "https://api.deepseek.com"}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: this.options.model ?? "deepseek-chat",
        messages: [{ role: "system", content: DESIGNER_SYSTEM_PROMPT }, ...params.messages.map(toOpenAIMessage)],
        tools: tools.map(toOpenAITool)
      })
    });

    if (!response.ok) {
      throw new Error(`DeepSeek chat completion failed with status ${response.status}.`);
    }

    return readOpenAIResponse(await response.json());
  }
}

export function createDesignerApp(options: CreateDesignerAppOptions = {}) {
  const sessionManager = new SessionManager(new InMemoryStore(), new LocalBroker());
  const engine = new AgentEngine({
    llmClient: createLLMClient(options),
    sessionManager,
    maxToolRounds: 50,
    observer: {
      onLLMRequest(sessionId, request) {
        console.log("[designer-demo] llm_request", { sessionId, messages: request.messages.length, tools: request.tools.length });
      },
      onLLMResponse(sessionId, response) {
        console.log("[designer-demo] llm_response", {
          sessionId,
          text: response.text,
          toolCalls: response.toolCalls?.map((call) => call.name)
        });
      },
      onToolCall(sessionId, call) {
        console.log("[designer-demo] tool_call", { sessionId, name: call.name, callId: call.callId });
      }
    }
  });
  const app = express();

  app.use(express.json({ limit: "2mb" }));
  app.use("/dist", express.static(resolveDistDir()));
  app.get("/health", (_request, response) => {
    response.status(200).json({ ok: true });
  });
  app.get("/", (_request, response) => {
    response.type("html").send(createHtmlShell());
  });
  app.use(createExpressAgentRouter(engine, { heartbeatIntervalMs: 10_000 }));

  return { app, engine, sessionManager };
}

function createLLMClient(options: CreateDesignerAppOptions): LLMClient {
  if (!options.forceScriptedLLM && process.env.DEEPSEEK_API_KEY) {
    return new DeepSeekDesignerLLMClient({ apiKey: process.env.DEEPSEEK_API_KEY });
  }
  console.log("[designer-demo] using scripted LLM fallback");
  return new ScriptedDesignerLLMClient();
}

function createHtmlShell(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AI Designer Board</title>
    <link rel="stylesheet" href="/dist/App.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/dist/App.js"></script>
  </body>
</html>`;
}

function resolveDistDir(): string {
  return path.basename(__dirname) === "src" ? path.join(__dirname, "../dist") : __dirname;
}

function toolCall(callId: string, name: string, args: unknown): ToolCall {
  return { callId, name, arguments: args };
}

function toOpenAITool(tool: ToolDefinition): unknown {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  };
}

function mergeTools(visibleTools: ToolDefinition[], discoveredTools: ToolDefinition[]): ToolDefinition[] {
  const toolsByName = new Map<string, ToolDefinition>();
  for (const tool of [...visibleTools, ...discoveredTools]) {
    toolsByName.set(tool.name, tool);
  }
  return [...toolsByName.values()];
}

function readDiscoveredTools(messages: ChatMessage[]): ToolDefinition[] {
  return messages.flatMap((message) => {
    if (message.role !== "tool") {
      return [];
    }

    const content = parseToolResultContent(message.content);
    if (!content || !Array.isArray(content.result)) {
      return [];
    }

    return content.result.flatMap(readToolDefinition);
  });
}

function parseToolResultContent(content: string): { result?: unknown } | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readToolDefinition(input: unknown): ToolDefinition[] {
  if (!isRecord(input) || typeof input.name !== "string" || typeof input.description !== "string" || !isRecord(input.parameters)) {
    return [];
  }

  return [
    {
      name: input.name,
      description: input.description,
      parameters: input.parameters,
      ...(input.level === "L1" || input.level === "L2" || input.level === "L3" ? { level: input.level } : {}),
      ...(input.risk === "low" || input.risk === "medium" || input.risk === "high" ? { risk: input.risk } : {}),
      ...(typeof input.domain === "string" ? { domain: input.domain } : {}),
      ...(Array.isArray(input.tags) && input.tags.every((tag) => typeof tag === "string") ? { tags: input.tags } : {})
    }
  ];
}

function toOpenAIMessage(message: ChatMessage): unknown {
  if (message.role === "assistant" && message.toolCalls && message.toolCalls.length > 0) {
    return {
      role: "assistant",
      content: message.content.length > 0 ? message.content : null,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.callId,
        type: "function",
        function: { name: call.name, arguments: JSON.stringify(call.arguments ?? {}) }
      }))
    };
  }
  if (message.role === "tool") {
    return { role: "tool", tool_call_id: message.toolCallId, content: message.content };
  }
  return { role: message.role, content: message.content };
}

function readOpenAIResponse(body: unknown): LLMResponse {
  if (!isRecord(body) || !Array.isArray(body.choices)) {
    return {};
  }
  const [choice] = body.choices;
  if (!isRecord(choice) || !isRecord(choice.message)) {
    return {};
  }
  if (Array.isArray(choice.message.tool_calls)) {
    const toolCalls = choice.message.tool_calls.flatMap(readOpenAIToolCall);
    return toolCalls.length > 0 ? { toolCalls } : {};
  }
  return typeof choice.message.content === "string" ? { text: choice.message.content } : {};
}

function readOpenAIToolCall(input: unknown): ToolCall[] {
  if (!isRecord(input) || !isRecord(input.function)) {
    return [];
  }
  if (typeof input.id !== "string" || typeof input.function.name !== "string") {
    return [];
  }
  return [
    {
      callId: input.id,
      name: input.function.name,
      arguments: parseToolArguments(input.function.arguments)
    }
  ];
}

function parseToolArguments(input: unknown): unknown {
  if (typeof input !== "string" || input.length === 0) {
    return {};
  }
  try {
    return JSON.parse(input) as unknown;
  } catch {
    return input;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

if (process.env.NODE_ENV !== "test") {
  const { app } = createDesignerApp();
  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, () => {
    console.log(`AI Designer Board demo listening on http://localhost:${port}`);
  });
}
