import { describe, expect, it } from "vitest";
import { SessionManager } from "@agent-remote/server-core";
import { createFastifyAgentPlugin } from "../src/index";

describe("@agent-remote/server-fastify", () => {
  it("creates a fastify plugin descriptor", () => {
    const manager = new SessionManager();

    expect(createFastifyAgentPlugin(manager)).toEqual({
      kind: "fastify",
      manager
    });
  });
});
