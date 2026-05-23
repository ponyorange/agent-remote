import { describe, expect, it } from "vitest";
import { SessionManager } from "@agent-remote/server-core";
import { createExpressAgentRouter } from "../src/index";

describe("@agent-remote/server-express", () => {
  it("creates an express router descriptor", () => {
    const manager = new SessionManager();

    expect(createExpressAgentRouter(manager)).toEqual({
      kind: "express",
      manager
    });
  });
});
