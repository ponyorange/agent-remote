import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createDesignerApp, DeepSeekDesignerLLMClient, ScriptedDesignerLLMClient } from "../src/server";

describe("ai designer server", () => {
  it("serves health and the React shell", async () => {
    const { app } = createDesignerApp({ forceScriptedLLM: true });
    const server = app.listen(0);
    const address = server.address();
    if (typeof address !== "object" || !address) {
      throw new Error("Expected test server address.");
    }
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const health = await fetch(`${baseUrl}/health`);
      expect(await health.json()).toEqual({ ok: true });

      const shell = await fetch(baseUrl);
      const html = await shell.text();
      expect(html).toContain("AI Designer Board");
      expect(html).toContain("/dist/App.css");
    } finally {
      server.close();
    }
  });

  it("scripted LLM creates visible tool calls for the main prompt", async () => {
    const client = new ScriptedDesignerLLMClient();
    const response = await client.chat({
      messages: [{ role: "user", content: "帮我在画布中间放一个蓝色圆形，直径 200px，并在下方添加文字 Hello World" }],
      tools: []
    });

    expect(response.toolCalls?.map((call) => call.name)).toEqual(["create_shape", "create_text"]);
  });

  it("scripted LLM discovers and then executes L2 style tools", async () => {
    const client = new ScriptedDesignerLLMClient();
    const searchResponse = await client.chat({
      messages: [{ role: "user", content: "把整个画板变成极简风格，并添加一个小型进度图表" }],
      tools: []
    });
    expect(searchResponse.toolCalls?.map((call) => call.name)).toEqual(["search_tools", "search_tools"]);
    expect(searchResponse.toolCalls?.map((call) => call.arguments)).toEqual([
      { query: "style", maxResults: 5 },
      { query: "chart", maxResults: 5 }
    ]);

    const toolResponse = await client.chat({
      messages: [
        { role: "user", content: "把整个画板变成极简风格，并添加一个小型进度图表" },
        { role: "tool", content: "{\"ok\":true,\"result\":[]}", toolCallId: "script-search-style" },
        { role: "tool", content: "{\"ok\":true,\"result\":[]}", toolCallId: "script-search-chart" }
      ],
      tools: []
    });
    expect(toolResponse.toolCalls?.map((call) => call.name)).toEqual(["apply_style_preset", "create_chart"]);
  });

  it("build config creates a browser bundle for the React app", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8")
    ) as { scripts: Record<string, string> };
    const tsupConfig = readFileSync(new URL("../tsup.config.ts", import.meta.url), "utf8");

    expect(packageJson.scripts.build).toBe("tsup --config tsup.config.ts");
    expect(tsupConfig).toContain('platform: "browser"');
    expect(tsupConfig).toContain("noExternal: browserNoExternal");
  });

  it("allows longer designer sessions before stopping tool loops", () => {
    const serverSource = readFileSync(new URL("../src/server.ts", import.meta.url), "utf8");

    expect(serverSource).toContain("maxToolRounds: 50");
  });

  it("DeepSeek client makes searched L2 tools callable after search_tools results", async () => {
    let capturedBody: unknown;
    const client = new DeepSeekDesignerLLMClient({
      apiKey: "test-key",
      fetch: async (_url, init) => {
        capturedBody = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 });
      }
    });

    await client.chat({
      messages: [
        {
          role: "assistant",
          content: "",
          toolCalls: [{ callId: "search-1", name: "search_tools", arguments: { query: "style" } }]
        },
        {
          role: "tool",
          toolCallId: "search-1",
          content: JSON.stringify({
            callId: "search-1",
            ok: true,
            result: [
              {
                name: "apply_style_preset",
                description: "Apply a visual preset.",
                parameters: { type: "object", properties: { preset: { type: "string" } }, required: ["preset"] },
                level: "L2"
              }
            ]
          })
        }
      ],
      tools: [
        {
          name: "search_tools",
          description: "Search registered browser tools.",
          parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }
        }
      ]
    });

    const toolNames = readRequestToolNames(capturedBody);
    expect(toolNames).toContain("search_tools");
    expect(toolNames).toContain("apply_style_preset");
  });

  it("scripted LLM returns assistant text after tool results", async () => {
    const client = new ScriptedDesignerLLMClient();
    const response = await client.chat({
      messages: [{ role: "tool", content: "{\"ok\":true}", toolCallId: "call-1" }],
      tools: []
    });

    expect(response.text).toContain("已完成");
  });
});

function readRequestToolNames(body: unknown): string[] {
  if (typeof body !== "object" || body === null || !("tools" in body) || !Array.isArray(body.tools)) {
    return [];
  }

  return body.tools.flatMap((tool) => {
    if (
      typeof tool === "object" &&
      tool !== null &&
      "function" in tool &&
      typeof tool.function === "object" &&
      tool.function !== null &&
      "name" in tool.function &&
      typeof tool.function.name === "string"
    ) {
      return [tool.function.name];
    }
    return [];
  });
}
