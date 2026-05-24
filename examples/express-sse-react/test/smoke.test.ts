import http, { type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createDemoApp } from "../src/server";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        })
    )
  );
});

describe("express-sse-react example", () => {
  it("streams a tool call over SSE after a user message", async () => {
    const baseUrl = await listen();
    const eventPromise = readFirstProtocolEvent(`${baseUrl}/sse?session_id=demo-session`);

    await fetch(`${baseUrl}/api/register_tools`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "demo-session",
        tools: [
          {
            name: "change_background",
            description: "Change the document background color.",
            parameters: { type: "object" },
            risk: "low"
          }
        ]
      })
    });
    await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "demo-session",
        text: "Change the background"
      })
    });

    await expect(eventPromise).resolves.toContain("agent_remote:tool_call");
  });
});

async function listen(): Promise<string> {
  const { app } = createDemoApp();
  const server = http.createServer(app);
  servers.push(server);

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function readFirstProtocolEvent(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        if (chunk.includes("event:")) {
          request.destroy();
          resolve(chunk);
        }
      });
    });

    request.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "ECONNRESET") {
        reject(error);
      }
    });
    request.setTimeout(1_000, () => {
      request.destroy();
      reject(new Error("Timed out waiting for SSE event"));
    });
  });
}
