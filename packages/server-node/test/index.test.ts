import { describe, expect, it } from "vitest";
import { SessionManager } from "@agent-remote/server-core";
import { createNodeAgentRouter } from "../src/index";

describe("@agent-remote/server-node", () => {
  it("creates a node router descriptor", () => {
    const manager = new SessionManager();

    expect(createNodeAgentRouter(manager)).toEqual({
      kind: "node",
      manager
    });
  });
});
