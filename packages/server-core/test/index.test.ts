import { describe, expect, it } from "vitest";
import { InMemoryStore, SessionManager } from "../src/index";

describe("@agent-remote/server-core", () => {
  it("stores registered tools by session", async () => {
    const store = new InMemoryStore();
    const manager = new SessionManager(store);

    await manager.registerTools("session-1", [
      {
        name: "export_csv",
        description: "Export current table as CSV",
        parameters: { type: "object" }
      }
    ]);

    await expect(store.get("session-1")).resolves.toMatchObject({
      tools: [{ name: "export_csv" }],
      messages: []
    });
  });
});
