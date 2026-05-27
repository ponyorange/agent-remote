import { describe, expect, it } from "vitest";
import {
  arrangeElementsEvenly,
  boardReducer,
  createInitialBoardState,
  createShapeElement,
  createTextElement,
  summarizeBoard
} from "../src/boardState";
import {
  canSendPrompt,
  completeToolChatItem,
  createAssistantChatItem,
  createToolResultChatItem,
  createToolStartChatItem,
  createUserChatItem,
  failToolChatItem
} from "../src/chatLog";
import { dequeueConfirmation, enqueueConfirmation } from "../src/confirmationQueue";
import { createDesignerTools } from "../src/tools";

describe("boardState", () => {
  it("creates shape and text elements with undoable history", () => {
    let state = createInitialBoardState();
    state = boardReducer(state, {
      type: "createElement",
      element: createShapeElement({
        id: "shape-1",
        shape: "circle",
        x: 400,
        y: 260,
        radius: 100,
        fill: "blue"
      })
    });
    state = boardReducer(state, {
      type: "createElement",
      element: createTextElement({
        id: "text-1",
        text: "Hello World",
        x: 400,
        y: 410,
        fontSize: 24,
        align: "center"
      })
    });

    expect(state.elements).toHaveLength(2);
    expect(state.history).toHaveLength(2);

    state = boardReducer(state, { type: "undo" });
    expect(state.elements.map((element) => element.id)).toEqual(["shape-1"]);
  });

  it("updates, moves, deletes, and clears elements", () => {
    let state = createInitialBoardState();
    state = boardReducer(state, {
      type: "createElement",
      element: createShapeElement({ id: "rect-1", shape: "rect", x: 20, y: 30, width: 80, height: 60 })
    });
    state = boardReducer(state, { type: "moveElement", id: "rect-1", x: 120, y: 140 });
    state = boardReducer(state, { type: "updateElement", id: "rect-1", patch: { fill: "#ff00aa", rotation: 15 } });

    expect(state.elements[0]).toMatchObject({ x: 120, y: 140, fill: "#ff00aa", rotation: 15 });

    state = boardReducer(state, { type: "deleteElement", id: "rect-1" });
    expect(state.elements).toHaveLength(0);

    state = boardReducer(state, {
      type: "createElement",
      element: createTextElement({ id: "text-2", text: "Clear me", x: 10, y: 10 })
    });
    state = boardReducer(state, { type: "clearCanvas" });
    expect(state.elements).toHaveLength(0);
    expect(state.history.length).toBeGreaterThan(0);
  });

  it("sets background, selects elements, duplicates, aligns, and summarizes", () => {
    let state = createInitialBoardState();
    state = boardReducer(state, {
      type: "createElement",
      element: createShapeElement({ id: "a", shape: "rect", x: 10, y: 20, width: 60, height: 40 })
    });
    state = boardReducer(state, {
      type: "createElement",
      element: createShapeElement({ id: "b", shape: "rect", x: 100, y: 80, width: 60, height: 40 })
    });
    state = boardReducer(state, { type: "selectElements", ids: ["a", "b"] });
    state = boardReducer(state, {
      type: "setBackground",
      background: { type: "linear-gradient", from: "#111827", to: "#38bdf8" }
    });
    state = boardReducer(state, { type: "duplicateElement", id: "a", newId: "a-copy", offsetX: 20, offsetY: 30 });
    state = boardReducer(state, { type: "alignElements", ids: ["a", "b"], mode: "center" });

    expect(state.selectedIds).toEqual(["a", "b"]);
    expect(state.background.type).toBe("linear-gradient");
    expect(state.elements.find((element) => element.id === "a-copy")).toMatchObject({ x: 30, y: 50 });

    const summary = summarizeBoard(state);
    expect(summary.elements).toHaveLength(3);
    expect(summary.selectedIds).toEqual(["a", "b"]);
  });

  it("aligns elements by visual bounds", () => {
    const elements = [
      createShapeElement({ id: "a", shape: "rect", x: 10, y: 20, width: 60, height: 40 }),
      createShapeElement({ id: "b", shape: "rect", x: 100, y: 80, width: 120, height: 80 })
    ];

    expect(boardReducer({ ...createInitialBoardState(), elements }, { type: "alignElements", ids: ["a", "b"], mode: "right" })
      .elements.find((element) => element.id === "b")).toMatchObject({ x: -50 });
    expect(boardReducer({ ...createInitialBoardState(), elements }, { type: "alignElements", ids: ["a", "b"], mode: "center" })
      .elements.find((element) => element.id === "b")).toMatchObject({ x: -20 });
    expect(boardReducer({ ...createInitialBoardState(), elements }, { type: "alignElements", ids: ["a", "b"], mode: "bottom" })
      .elements.find((element) => element.id === "b")).toMatchObject({ y: -20 });
  });

  it("aligns centered text by its rendered visual bounds", () => {
    const elements = [
      createShapeElement({ id: "a", shape: "rect", x: 10, y: 20, width: 60, height: 40 }),
      createTextElement({ id: "b", text: "Centered", x: 200, y: 80, fontSize: 24, align: "center" })
    ];

    expect(boardReducer({ ...createInitialBoardState(), elements }, { type: "alignElements", ids: ["a", "b"], mode: "center" })
      .elements.find((element) => element.id === "b")).toMatchObject({ x: 40 });
    expect(boardReducer({ ...createInitialBoardState(), elements }, { type: "alignElements", ids: ["a", "b"], mode: "right" })
      .elements.find((element) => element.id === "b")).toMatchObject({ x: -60 });
  });

  it("arranges elements evenly in both directions", () => {
    const elements = [
      createShapeElement({ id: "a", shape: "circle", x: 10, y: 10, radius: 20 }),
      createShapeElement({ id: "b", shape: "circle", x: 80, y: 40, radius: 20 }),
      createShapeElement({ id: "c", shape: "circle", x: 400, y: 120, radius: 20 })
    ];

    expect(arrangeElementsEvenly(elements, ["a", "b", "c"], "horizontal").map((element) => element.x)).toEqual([
      10,
      205,
      400
    ]);
    expect(arrangeElementsEvenly(elements, ["a", "b", "c"], "vertical").map((element) => element.y)).toEqual([
      10,
      65,
      120
    ]);
  });
});

describe("designer tools", () => {
  it("registers core, advanced, and high-risk tools", async () => {
    let state = createInitialBoardState();
    const tools = createDesignerTools({
      getState: () => state,
      dispatch: (action) => {
        state = boardReducer(state, action);
        return state;
      },
      exportCanvas: async () => "data:image/png;base64,demo"
    });

    expect(tools.map((tool) => tool.definition.name)).toEqual([
      "get_canvas_state",
      "create_shape",
      "create_text",
      "update_element",
      "move_element",
      "delete_element",
      "arrange_evenly",
      "set_background_gradient",
      "undo",
      "apply_style_preset",
      "create_chart",
      "duplicate_element",
      "align_elements",
      "export_canvas",
      "clear_canvas"
    ]);
    expect(tools.find((tool) => tool.definition.name === "apply_style_preset")?.definition.level).toBe("L2");
    expect(tools.find((tool) => tool.definition.name === "export_canvas")?.definition.risk).toBe("high");
    expect(tools.find((tool) => tool.definition.name === "move_element")?.definition.parameters).toMatchObject({
      required: ["id", "x", "y"]
    });
    expect(tools.find((tool) => tool.definition.name === "export_canvas")?.definition.parameters).toMatchObject({
      properties: { format: { type: "string", enum: ["png"] } }
    });
  });

  it("executes create, layout, export, and undo handlers", async () => {
    let state = createInitialBoardState();
    const tools = createDesignerTools({
      getState: () => state,
      dispatch: (action) => {
        state = boardReducer(state, action);
        return state;
      },
      exportCanvas: async () => "data:image/png;base64,demo"
    });
    const call = async (name: string, args: unknown) => tools.find((tool) => tool.definition.name === name)?.handler(args);

    await call("create_shape", { id: "circle-1", type: "circle", x: 400, y: 260, radius: 100, color: "blue" });
    await call("create_text", {
      id: "text-1",
      content: "Hello World",
      x: 400,
      y: 410,
      fontSize: 24,
      align: "center"
    });
    await call("set_background_gradient", { from: "#111827", to: "#38bdf8" });

    expect(state.elements).toHaveLength(2);
    expect(state.background.type).toBe("linear-gradient");

    const exported = await call("export_canvas", { format: "png" });
    expect(exported).toEqual({ format: "png", dataUrl: "data:image/png;base64,demo" });

    await call("undo", {});
    expect(state.background.type).toBe("solid");
  });

  it("returns the updated state from handlers that report board state", async () => {
    const initialState = createInitialBoardState();
    const tools = createDesignerTools({
      getState: () => initialState,
      dispatch: (action) => boardReducer(initialState, action),
      exportCanvas: async () => "data:image/png;base64,demo"
    });
    const call = async (name: string, args: unknown) => tools.find((tool) => tool.definition.name === name)?.handler(args);

    await expect(call("set_background_gradient", { from: "#111827", to: "#38bdf8" })).resolves.toEqual({
      background: { type: "linear-gradient", from: "#111827", to: "#38bdf8" }
    });
  });
});

describe("chat log", () => {
  it("formats user, assistant, and tool activity for the chat window", () => {
    expect(createUserChatItem("user-1", "画一个圆")).toMatchObject({
      role: "user",
      title: "你",
      content: "画一个圆"
    });
    expect(createAssistantChatItem("assistant-1", "已完成")).toMatchObject({
      role: "assistant",
      title: "AI 设计师",
      content: "已完成"
    });
    expect(createToolStartChatItem("tool-1", { callId: "call-1", name: "create_shape", arguments: { x: 10 } })).toMatchObject({
      role: "tool",
      title: "调用工具: create_shape",
      content: "{\n  \"x\": 10\n}",
      status: "pending"
    });
    expect(createToolResultChatItem("tool-2", "create_shape", { id: "shape-1" })).toMatchObject({
      role: "tool",
      title: "工具完成: create_shape",
      content: "{\n  \"id\": \"shape-1\"\n}",
      status: "success"
    });
  });

  it("requires a connected agent before prompt submission", () => {
    expect(canSendPrompt({ agentStatus: "connecting", isBusy: false, text: "画一个圆" })).toBe(false);
    expect(canSendPrompt({ agentStatus: "connected", isBusy: false, text: "画一个圆" })).toBe(true);
    expect(canSendPrompt({ agentStatus: "connected", isBusy: true, text: "画一个圆" })).toBe(false);
    expect(canSendPrompt({ agentStatus: "connected", isBusy: false, text: "   " })).toBe(false);
  });

  it("marks the pending tool chat item as complete", () => {
    const pending = createToolStartChatItem("tool-1", {
      callId: "call-1",
      name: "create_shape",
      arguments: { x: 10 }
    });

    expect(completeToolChatItem([pending], "tool-1", { id: "shape-1" })).toEqual([
      {
        id: "tool-1",
        role: "tool",
        title: "工具完成: create_shape",
        content: "{\n  \"id\": \"shape-1\"\n}",
        status: "success"
      }
    ]);
  });

  it("marks the pending tool chat item as failed", () => {
    const pending = createToolStartChatItem("tool-1", {
      callId: "call-1",
      name: "create_shape",
      arguments: { x: 10 }
    });

    expect(failToolChatItem([pending], "tool-1", "boom")).toEqual([
      {
        id: "tool-1",
        role: "tool",
        title: "工具失败: create_shape",
        content: "boom",
        status: "error"
      }
    ]);
  });
});

describe("confirmation queue", () => {
  it("queues high-risk confirmations and dequeues them one at a time", () => {
    const queued = enqueueConfirmation(["export"], "clear");

    expect(queued).toEqual(["export", "clear"]);
    expect(dequeueConfirmation(queued)).toEqual({ current: "export", remaining: ["clear"] });
  });
});
