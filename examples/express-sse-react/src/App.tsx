import { useCallback, useEffect } from "react";
import { createSSEClient } from "@agent-remote/client/sse";
import { useAgentClient } from "@agent-remote/react";

export function App() {
  const createClient = useCallback(
    () =>
      createSSEClient({
        kind: "sse",
        sseUrl: "/sse",
        sessionId: crypto.randomUUID(),
        retryAttempts: 1,
        postUrls: {
          registerTools: "/api/register_tools",
          sendMessage: "/api/chat",
          toolResult: "/api/tool_result"
        }
      }),
    []
  );
  const agent = useAgentClient(
    createClient,
    { disconnectOnUnmount: true }
  );

  useEffect(() => {
    agent?.registerTool(
      {
        name: "change_background",
        description: "Change the document background color.",
        parameters: {
          type: "object",
          properties: {
            color: { type: "string" }
          },
          required: ["color"]
        },
        risk: "low",
        domain: "ui",
        tags: ["demo"]
      },
      (args) => {
        const input = args as { color?: string };
        document.body.style.backgroundColor = input.color ?? "white";
        return { color: document.body.style.backgroundColor };
      }
    );
    void agent?.connect();
  }, [agent]);

  return (
    <main>
      <h1>Agent Remote Demo</h1>
      <button type="button" onClick={() => void agent?.sendMessage("Change the background to blue")}>
        Ask agent
      </button>
      <p>Agent status: {agent?.status ?? "disabled"}</p>
      <p>Last message: {agent?.lastMessage ?? "None"}</p>
    </main>
  );
}
