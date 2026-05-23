import { describe, expect, it } from "vitest";
import { createAgentClientState } from "../src/index";

describe("@agent-remote/react", () => {
  it("returns a client state when enabled", () => {
    const client = { id: "client-1" };

    expect(createAgentClientState(client)).toBe(client);
  });

  it("returns null when disabled", () => {
    expect(createAgentClientState({ id: "client-1" }, { enabled: false })).toBeNull();
  });
});
