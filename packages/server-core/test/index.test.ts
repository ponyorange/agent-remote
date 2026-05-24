import { describe, expect, it, vi } from "vitest";
import { createAssistantMessage, createToolCallMessage, type TransportConnection } from "@agent-remote/core";
import { InMemoryStore, LocalBroker, SessionManager } from "../src/index";

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

  it("deletes stored sessions", async () => {
    const store = new InMemoryStore();
    await store.set("session-1", { tools: [], messages: [] });

    await store.delete("session-1");

    await expect(store.get("session-1")).resolves.toBeNull();
  });

  it("saves and reads session data through the manager", async () => {
    const manager = new SessionManager();

    await manager.saveData("session-1", {
      tools: [],
      messages: [{ role: "user", content: "Export this table" }]
    });

    await expect(manager.getData("session-1")).resolves.toEqual({
      tools: [],
      messages: [{ role: "user", content: "Export this table" }]
    });
  });

  it("preserves messages and normalizes tools when registering tools", async () => {
    const manager = new SessionManager();
    await manager.saveData("session-1", {
      tools: [],
      messages: [{ role: "user", content: "Keep this history" }]
    });

    const data = await manager.registerTools("session-1", [
      {
        name: "export_csv",
        description: "Export current table as CSV",
        parameters: { type: "object" }
      }
    ]);

    expect(data).toMatchObject({
      tools: [{ name: "export_csv", level: "L1" }],
      messages: [{ role: "user", content: "Keep this history" }]
    });
  });

  it("sends messages to a locally attached transport before using the broker", async () => {
    const broker = new LocalBroker();
    const publish = vi.spyOn(broker, "publish");
    const send = vi.fn();
    const manager = new SessionManager(new InMemoryStore(), broker);
    const transport: TransportConnection = {
      send,
      onMessage: vi.fn(),
      close: vi.fn()
    };
    const message = createToolCallMessage({
      callId: "call-1",
      name: "export_csv",
      arguments: { format: "csv" }
    });

    manager.attachTransport("session-1", transport);
    await manager.sendToSession("session-1", message);

    expect(send).toHaveBeenCalledWith(message);
    expect(publish).not.toHaveBeenCalled();
  });

  it("publishes messages through the broker when no local transport is attached", async () => {
    const broker = new LocalBroker();
    const publish = vi.spyOn(broker, "publish");
    const manager = new SessionManager(new InMemoryStore(), broker);
    const message = createAssistantMessage("Done");

    await manager.sendToSession("session-1", message);

    expect(publish).toHaveBeenCalledWith("session-1", message);
  });

  it("routes broker messages to the manager that owns the local transport", async () => {
    const broker = new LocalBroker();
    const send = vi.fn();
    const remoteManager = new SessionManager(new InMemoryStore(), broker);
    const localManager = new SessionManager(new InMemoryStore(), broker);
    const message = createAssistantMessage("Done");

    localManager.attachTransport("session-1", {
      send,
      onMessage: vi.fn(),
      close: vi.fn()
    });
    await remoteManager.sendToSession("session-1", message);

    expect(send).toHaveBeenCalledWith(message);
  });
});
