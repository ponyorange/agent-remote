import express from "express";
import {
  AgentEngine,
  InMemoryStore,
  LocalBroker,
  SessionManager,
  type LLMClient,
  type LLMRequest,
  type LLMResponse
} from "agent-remote-server-core";
import { createExpressAgentRouter } from "agent-remote-server-express";

class DemoLLMClient implements LLMClient {
  async chat(params: LLMRequest): Promise<LLMResponse> {
    const lastMessage = params.messages.at(-1);

    if (lastMessage?.role === "tool") {
      return { text: "Background color updated." };
    }

    return {
      toolCalls: [
        {
          callId: "demo-change-background",
          name: "change_background",
          arguments: { color: "blue" }
        }
      ]
    };
  }
}

export function createDemoApp() {
  const sessionManager = new SessionManager(new InMemoryStore(), new LocalBroker());
  const engine = new AgentEngine({
    llmClient: new DemoLLMClient(),
    sessionManager
  });
  const app = express();

  app.use(express.json());
  app.get("/health", (_request, response) => {
    response.status(200).json({ ok: true });
  });
  app.use(createExpressAgentRouter(engine, { heartbeatIntervalMs: 10_000 }));

  return { app, engine, sessionManager };
}

if (process.env.NODE_ENV !== "test") {
  const { app } = createDemoApp();
  const port = Number(process.env.PORT ?? 3000);

  app.listen(port, () => {
    console.log(`Agent Remote demo listening on http://localhost:${port}`);
  });
}
