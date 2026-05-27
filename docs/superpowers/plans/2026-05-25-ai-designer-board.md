# AI Designer Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete runnable `examples/ai-designer-board` demo where a DeepSeek-backed Agent Remote server controls a React Konva whiteboard through browser-registered tools.

**Architecture:** Add a new private Rush example package that follows the repository's Express + SSE + React conventions. The server selects DeepSeek when `DEEPSEEK_API_KEY` is set and otherwise uses a deterministic scripted LLM for CI and local demos. The browser owns board state, registers whiteboard tools, executes tool calls through Agent Remote, and renders the canvas with React Konva.

**Tech Stack:** TypeScript, Rush, pnpm, Express 5, Agent Remote packages, React 18, React Konva/Konva, tsx, tsup, Vitest.

---

## File Structure

- Create `examples/ai-designer-board/package.json`: private example package, scripts, workspace dependencies, React Konva dependencies.
- Create `examples/ai-designer-board/tsconfig.json`: extends `../../tsconfig.base.json`, includes `src` and `test`.
- Create `examples/ai-designer-board/README.md`: English demo overview, setup, prompts, manual verification.
- Create `examples/ai-designer-board/README.zh-CN.md`: Chinese demo overview, setup, prompts, manual verification.
- Create `examples/ai-designer-board/src/boardState.ts`: pure board model, reducer, history, arrangement, style helpers.
- Create `examples/ai-designer-board/src/tools.ts`: Agent Remote tool definitions and handlers bound to a board controller interface.
- Create `examples/ai-designer-board/src/samplePrompts.ts`: curated demo prompts.
- Create `examples/ai-designer-board/src/DesignerBoard.tsx`: React Konva stage rendering, drag updates, selection, export ref support.
- Create `examples/ai-designer-board/src/App.tsx`: layout, chat, client setup, tool registration, confirmation modal, activity log.
- Create `examples/ai-designer-board/src/server.ts`: Express app, static HTML shell, Agent Remote routes, DeepSeek/scripted LLM clients.
- Create `examples/ai-designer-board/test/boardState.test.ts`: reducer/helper tests.
- Create `examples/ai-designer-board/test/smoke.test.ts`: server and fallback Agent Remote smoke tests.
- Modify `rush.json`: add `agent-remote-example-ai-designer-board` under `examples/ai-designer-board`.

Do not modify public package APIs unless a test proves a blocking gap. Do not create commits during implementation unless the user explicitly requests commits.

## Task 1: Workspace and Package Scaffold

**Files:**
- Create: `examples/ai-designer-board/package.json`
- Create: `examples/ai-designer-board/tsconfig.json`
- Modify: `rush.json`

- [ ] **Step 1: Add package metadata**

Create `examples/ai-designer-board/package.json`:

```json
{
  "name": "agent-remote-example-ai-designer-board",
  "version": "0.1.0",
  "private": true,
  "description": "AI designer whiteboard demo for agent-remote with Express, SSE, React, Konva, and DeepSeek.",
  "license": "MIT",
  "type": "module",
  "scripts": {
    "build": "tsup src/server.ts src/App.tsx --format esm --clean",
    "dev": "tsx src/server.ts",
    "test": "vitest run",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "agent-remote-client": "workspace:*",
    "agent-remote-core": "workspace:*",
    "agent-remote-react": "workspace:*",
    "agent-remote-server-core": "workspace:*",
    "agent-remote-server-express": "workspace:*",
    "agent-remote-transport-sse": "workspace:*",
    "express": "~5.2.1",
    "konva": "^9.3.18",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-konva": "^18.2.10"
  },
  "devDependencies": {
    "@types/express": "~5.0.6",
    "@types/node": "^20.11.30",
    "@types/react": "^18.2.66",
    "@types/react-dom": "^18.2.22",
    "tsup": "^8.0.2",
    "tsx": "^4.0.0",
    "typescript": "~5.4.5",
    "vitest": "^1.6.1"
  }
}
```

- [ ] **Step 2: Add TypeScript config**

Create `examples/ai-designer-board/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Register the Rush project**

In `rush.json`, add this object under the examples projects:

```json
{
  "packageName": "agent-remote-example-ai-designer-board",
  "projectFolder": "examples/ai-designer-board",
  "reviewCategory": "examples"
}
```

Keep JSON valid by adding a comma after the previous object.

- [ ] **Step 4: Install new dependencies**

Run:

```bash
rush update
```

Expected: pnpm lockfile updates successfully and the new example appears in Rush output.

- [ ] **Step 5: Verify scaffold is discoverable**

Run:

```bash
rush list --json
```

Expected: output includes `agent-remote-example-ai-designer-board`.

- [ ] **Step 6: Checkpoint diff**

Run:

```bash
git diff -- examples/ai-designer-board/package.json examples/ai-designer-board/tsconfig.json rush.json common/config/rush/pnpm-lock.yaml
```

Expected: diff only contains the new package scaffold, Rush registration, and dependency lockfile changes.

## Task 2: Board State Test and Model

**Files:**
- Create: `examples/ai-designer-board/test/boardState.test.ts`
- Create: `examples/ai-designer-board/src/boardState.ts`

- [ ] **Step 1: Write failing board state tests**

Create `examples/ai-designer-board/test/boardState.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  arrangeElementsEvenly,
  boardReducer,
  createInitialBoardState,
  createShapeElement,
  createTextElement,
  summarizeBoard
} from "../src/boardState";

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
```

- [ ] **Step 2: Run the tests and verify failure**

Run:

```bash
cd examples/ai-designer-board && pnpm test -- test/boardState.test.ts
```

Expected: FAIL because `src/boardState.ts` does not exist.

- [ ] **Step 3: Implement board state**

Create `examples/ai-designer-board/src/boardState.ts`:

```ts
export type ShapeKind = "circle" | "rect" | "rounded_rect";
export type ArrangeDirection = "horizontal" | "vertical";
export type AlignMode = "left" | "center" | "right" | "top" | "middle" | "bottom";

export interface SolidBackground {
  type: "solid";
  color: string;
}

export interface GradientBackground {
  type: "linear-gradient";
  from: string;
  to: string;
}

export type BoardBackground = SolidBackground | GradientBackground;

export interface BaseElement {
  id: string;
  x: number;
  y: number;
  rotation?: number;
  opacity?: number;
}

export interface ShapeElement extends BaseElement {
  kind: "shape";
  shape: ShapeKind;
  width?: number;
  height?: number;
  radius?: number;
  cornerRadius?: number;
  fill: string;
  stroke?: string;
}

export interface TextElement extends BaseElement {
  kind: "text";
  text: string;
  fontSize: number;
  fill: string;
  align: "left" | "center" | "right";
}

export interface ChartElement extends BaseElement {
  kind: "chart";
  title: string;
  values: number[];
  labels: string[];
  width: number;
  height: number;
  fill: string;
}

export type BoardElement = ShapeElement | TextElement | ChartElement;

export interface BoardSnapshot {
  elements: BoardElement[];
  selectedIds: string[];
  background: BoardBackground;
}

export interface BoardState extends BoardSnapshot {
  width: number;
  height: number;
  history: BoardSnapshot[];
}

export type BoardAction =
  | { type: "createElement"; element: BoardElement }
  | { type: "updateElement"; id: string; patch: Partial<BoardElement> }
  | { type: "moveElement"; id: string; x: number; y: number }
  | { type: "deleteElement"; id: string }
  | { type: "setBackground"; background: BoardBackground }
  | { type: "selectElements"; ids: string[] }
  | { type: "arrangeEvenly"; ids: string[]; direction: ArrangeDirection }
  | { type: "duplicateElement"; id: string; newId: string; offsetX: number; offsetY: number }
  | { type: "alignElements"; ids: string[]; mode: AlignMode }
  | { type: "applyStylePreset"; preset: "minimalist" | "playful" | "neon" }
  | { type: "clearCanvas" }
  | { type: "undo" };

export interface BoardSummary {
  width: number;
  height: number;
  background: BoardBackground;
  selectedIds: string[];
  elements: Array<{
    id: string;
    kind: BoardElement["kind"];
    x: number;
    y: number;
    label: string;
  }>;
}

export function createInitialBoardState(width = 960, height = 640): BoardState {
  return {
    width,
    height,
    elements: [],
    selectedIds: [],
    background: { type: "solid", color: "#f8fafc" },
    history: []
  };
}

export function createShapeElement(input: Partial<ShapeElement> & Pick<ShapeElement, "id" | "shape" | "x" | "y">): ShapeElement {
  const isCircle = input.shape === "circle";
  return {
    kind: "shape",
    fill: "#2563eb",
    width: isCircle ? undefined : 120,
    height: isCircle ? undefined : 80,
    radius: isCircle ? 60 : undefined,
    opacity: 1,
    ...input
  };
}

export function createTextElement(input: Partial<TextElement> & Pick<TextElement, "id" | "text" | "x" | "y">): TextElement {
  return {
    kind: "text",
    fontSize: 24,
    fill: "#111827",
    align: "left",
    opacity: 1,
    ...input
  };
}

export function createChartElement(input: Partial<ChartElement> & Pick<ChartElement, "id" | "title" | "values" | "labels" | "x" | "y">): ChartElement {
  return {
    kind: "chart",
    width: 260,
    height: 160,
    fill: "#38bdf8",
    opacity: 1,
    ...input
  };
}

export function boardReducer(state: BoardState, action: BoardAction): BoardState {
  switch (action.type) {
    case "createElement":
      return withHistory(state, {
        ...state,
        elements: [...state.elements, action.element],
        selectedIds: [action.element.id]
      });
    case "updateElement":
      return withHistory(state, {
        ...state,
        elements: state.elements.map((element) =>
          element.id === action.id ? ({ ...element, ...action.patch, id: element.id, kind: element.kind } as BoardElement) : element
        )
      });
    case "moveElement":
      return withHistory(state, {
        ...state,
        elements: state.elements.map((element) =>
          element.id === action.id ? { ...element, x: action.x, y: action.y } : element
        )
      });
    case "deleteElement":
      return withHistory(state, {
        ...state,
        elements: state.elements.filter((element) => element.id !== action.id),
        selectedIds: state.selectedIds.filter((id) => id !== action.id)
      });
    case "setBackground":
      return withHistory(state, { ...state, background: action.background });
    case "selectElements":
      return { ...state, selectedIds: action.ids };
    case "arrangeEvenly":
      return withHistory(state, {
        ...state,
        elements: arrangeElementsEvenly(state.elements, action.ids, action.direction)
      });
    case "duplicateElement": {
      const source = state.elements.find((element) => element.id === action.id);
      if (!source) {
        return state;
      }
      return withHistory(state, {
        ...state,
        elements: [
          ...state.elements,
          { ...source, id: action.newId, x: source.x + action.offsetX, y: source.y + action.offsetY }
        ],
        selectedIds: [action.newId]
      });
    }
    case "alignElements":
      return withHistory(state, { ...state, elements: alignElements(state.elements, action.ids, action.mode) });
    case "applyStylePreset":
      return withHistory(state, applyStylePreset(state, action.preset));
    case "clearCanvas":
      return withHistory(state, { ...state, elements: [], selectedIds: [] });
    case "undo": {
      const previous = state.history.at(-1);
      if (!previous) {
        return state;
      }
      return {
        ...state,
        elements: previous.elements,
        selectedIds: previous.selectedIds,
        background: previous.background,
        history: state.history.slice(0, -1)
      };
    }
    default:
      return state;
  }
}

export function arrangeElementsEvenly(elements: BoardElement[], ids: string[], direction: ArrangeDirection): BoardElement[] {
  const selected = elements.filter((element) => ids.includes(element.id));
  if (selected.length < 3) {
    return elements;
  }
  const sorted = [...selected].sort((a, b) => (direction === "horizontal" ? a.x - b.x : a.y - b.y));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const start = direction === "horizontal" ? first.x : first.y;
  const end = direction === "horizontal" ? last.x : last.y;
  const step = (end - start) / (sorted.length - 1);
  const positions = new Map(sorted.map((element, index) => [element.id, start + step * index]));

  return elements.map((element) => {
    const position = positions.get(element.id);
    if (position === undefined) {
      return element;
    }
    return direction === "horizontal" ? { ...element, x: position } : { ...element, y: position };
  });
}

export function alignElements(elements: BoardElement[], ids: string[], mode: AlignMode): BoardElement[] {
  const selected = elements.filter((element) => ids.includes(element.id));
  if (selected.length < 2) {
    return elements;
  }
  const anchor = selected[0];
  return elements.map((element) => {
    if (!ids.includes(element.id)) {
      return element;
    }
    if (mode === "left") {
      return { ...element, x: anchor.x };
    }
    if (mode === "center") {
      return { ...element, x: anchor.x };
    }
    if (mode === "right") {
      return { ...element, x: anchor.x };
    }
    if (mode === "top") {
      return { ...element, y: anchor.y };
    }
    if (mode === "middle") {
      return { ...element, y: anchor.y };
    }
    return { ...element, y: anchor.y };
  });
}

export function summarizeBoard(state: BoardState): BoardSummary {
  return {
    width: state.width,
    height: state.height,
    background: state.background,
    selectedIds: state.selectedIds,
    elements: state.elements.map((element) => ({
      id: element.id,
      kind: element.kind,
      x: element.x,
      y: element.y,
      label: getElementLabel(element)
    }))
  };
}

function withHistory(state: BoardState, next: BoardState): BoardState {
  return {
    ...next,
    history: [...state.history, snapshot(state)].slice(-50)
  };
}

function snapshot(state: BoardState): BoardSnapshot {
  return {
    elements: state.elements,
    selectedIds: state.selectedIds,
    background: state.background
  };
}

function applyStylePreset(state: BoardState, preset: "minimalist" | "playful" | "neon"): BoardState {
  const styles = {
    minimalist: { background: { type: "solid" as const, color: "#ffffff" }, fill: "#111827", text: "#111827" },
    playful: { background: { type: "linear-gradient" as const, from: "#fef3c7", to: "#f9a8d4" }, fill: "#f97316", text: "#7c2d12" },
    neon: { background: { type: "linear-gradient" as const, from: "#020617", to: "#312e81" }, fill: "#22d3ee", text: "#f8fafc" }
  }[preset];
  return {
    ...state,
    background: styles.background,
    elements: state.elements.map((element) =>
      element.kind === "text" ? { ...element, fill: styles.text } : { ...element, fill: styles.fill }
    )
  };
}

function getElementLabel(element: BoardElement): string {
  if (element.kind === "text") {
    return element.text;
  }
  if (element.kind === "chart") {
    return element.title;
  }
  return element.shape;
}
```

- [ ] **Step 4: Run board state tests**

Run:

```bash
cd examples/ai-designer-board && pnpm test -- test/boardState.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run TypeScript check for the package**

Run:

```bash
cd examples/ai-designer-board && pnpm lint
```

Expected: PASS or only reports files not yet created in later tasks. If it reports actual type errors in `boardState.ts`, fix them before continuing.

- [ ] **Step 6: Checkpoint diff**

Run:

```bash
git diff -- examples/ai-designer-board/src/boardState.ts examples/ai-designer-board/test/boardState.test.ts
```

Expected: diff contains only the board model and tests.

## Task 3: Tool Catalog and Handlers

**Files:**
- Create: `examples/ai-designer-board/src/tools.ts`
- Modify: `examples/ai-designer-board/test/boardState.test.ts`

- [ ] **Step 1: Add tests for tool-driven state changes**

Append this test block to `examples/ai-designer-board/test/boardState.test.ts`:

```ts
import { createDesignerTools } from "../src/tools";

describe("designer tools", () => {
  it("registers core, advanced, and high-risk tools", async () => {
    let state = createInitialBoardState();
    const tools = createDesignerTools({
      getState: () => state,
      dispatch: (action) => {
        state = boardReducer(state, action);
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
  });

  it("executes create, layout, export, and undo handlers", async () => {
    let state = createInitialBoardState();
    const tools = createDesignerTools({
      getState: () => state,
      dispatch: (action) => {
        state = boardReducer(state, action);
      },
      exportCanvas: async () => "data:image/png;base64,demo"
    });
    const call = async (name: string, args: unknown) => tools.find((tool) => tool.definition.name === name)?.handler(args);

    await call("create_shape", { id: "circle-1", type: "circle", x: 400, y: 260, radius: 100, color: "blue" });
    await call("create_text", { id: "text-1", content: "Hello World", x: 400, y: 410, fontSize: 24, align: "center" });
    await call("set_background_gradient", { from: "#111827", to: "#38bdf8" });

    expect(state.elements).toHaveLength(2);
    expect(state.background.type).toBe("linear-gradient");

    const exported = await call("export_canvas", { format: "png" });
    expect(exported).toEqual({ format: "png", dataUrl: "data:image/png;base64,demo" });

    await call("undo", {});
    expect(state.background.type).toBe("solid");
  });
});
```

If TypeScript reports duplicate imports, merge the new imports into the top import block instead of leaving two imports from the same module.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
cd examples/ai-designer-board && pnpm test -- test/boardState.test.ts
```

Expected: FAIL because `src/tools.ts` does not exist.

- [ ] **Step 3: Implement tool definitions and handlers**

Create `examples/ai-designer-board/src/tools.ts`:

```ts
import type { ToolDefinition } from "agent-remote-core";
import {
  type AlignMode,
  type ArrangeDirection,
  type BoardAction,
  type BoardState,
  createChartElement,
  createShapeElement,
  createTextElement,
  summarizeBoard
} from "./boardState";

export interface DesignerTool {
  definition: ToolDefinition;
  handler(args: unknown): unknown | Promise<unknown>;
}

export interface DesignerToolController {
  getState(): BoardState;
  dispatch(action: BoardAction): void;
  exportCanvas(format: "png"): Promise<string>;
}

export function createDesignerTools(controller: DesignerToolController): DesignerTool[] {
  const tool = (definition: ToolDefinition, handler: DesignerTool["handler"]): DesignerTool => ({ definition, handler });

  return [
    tool({
      name: "get_canvas_state",
      description: "Read the current whiteboard state, including canvas size, background, selected IDs, and element summaries.",
      level: "L1",
      risk: "low",
      domain: "whiteboard",
      tags: ["state", "read"],
      parameters: { type: "object", properties: {} }
    }, () => summarizeBoard(controller.getState())),
    tool({
      name: "create_shape",
      description: "Create a shape element on the whiteboard.",
      level: "L1",
      risk: "low",
      domain: "whiteboard",
      tags: ["shape", "create"],
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          type: { type: "string", enum: ["circle", "rect", "rounded_rect"] },
          x: { type: "number" },
          y: { type: "number" },
          width: { type: "number" },
          height: { type: "number" },
          radius: { type: "number" },
          color: { type: "string" }
        },
        required: ["type", "x", "y"]
      }
    }, (args) => {
      const input = readObject(args);
      const id = readString(input.id, createId("shape"));
      controller.dispatch({
        type: "createElement",
        element: createShapeElement({
          id,
          shape: readShapeKind(input.type),
          x: readNumber(input.x, 320),
          y: readNumber(input.y, 240),
          width: readOptionalNumber(input.width),
          height: readOptionalNumber(input.height),
          radius: readOptionalNumber(input.radius),
          fill: readString(input.color, "#2563eb")
        })
      });
      return { id };
    }),
    tool({
      name: "create_text",
      description: "Create a text element on the whiteboard.",
      level: "L1",
      risk: "low",
      domain: "whiteboard",
      tags: ["text", "create"],
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          content: { type: "string" },
          x: { type: "number" },
          y: { type: "number" },
          fontSize: { type: "number" },
          color: { type: "string" },
          align: { type: "string", enum: ["left", "center", "right"] }
        },
        required: ["content", "x", "y"]
      }
    }, (args) => {
      const input = readObject(args);
      const id = readString(input.id, createId("text"));
      controller.dispatch({
        type: "createElement",
        element: createTextElement({
          id,
          text: readString(input.content, "Text"),
          x: readNumber(input.x, 320),
          y: readNumber(input.y, 240),
          fontSize: readNumber(input.fontSize, 24),
          fill: readString(input.color, "#111827"),
          align: readTextAlign(input.align)
        })
      });
      return { id };
    }),
    tool(simpleDefinition("update_element", "Update common visual properties on an existing element.", "L1"), (args) => {
      const input = readObject(args);
      const id = readRequiredString(input.id, "id");
      controller.dispatch({ type: "updateElement", id, patch: readObject(input.patch) });
      return { id };
    }),
    tool(simpleDefinition("move_element", "Move an element to an absolute x/y position.", "L1"), (args) => {
      const input = readObject(args);
      const id = readRequiredString(input.id, "id");
      controller.dispatch({ type: "moveElement", id, x: readNumber(input.x, 0), y: readNumber(input.y, 0) });
      return { id };
    }),
    tool(simpleDefinition("delete_element", "Delete one element by ID.", "L1"), (args) => {
      const input = readObject(args);
      const id = readRequiredString(input.id, "id");
      controller.dispatch({ type: "deleteElement", id });
      return { id };
    }),
    tool(simpleDefinition("arrange_evenly", "Distribute elements evenly horizontally or vertically.", "L1"), (args) => {
      const input = readObject(args);
      const ids = readStringArray(input.ids, controller.getState().selectedIds);
      controller.dispatch({ type: "arrangeEvenly", ids, direction: readArrangeDirection(input.direction) });
      return { ids };
    }),
    tool(simpleDefinition("set_background_gradient", "Set a linear gradient background.", "L1"), (args) => {
      const input = readObject(args);
      controller.dispatch({
        type: "setBackground",
        background: { type: "linear-gradient", from: readString(input.from, "#111827"), to: readString(input.to, "#38bdf8") }
      });
      return { background: controller.getState().background };
    }),
    tool(simpleDefinition("undo", "Undo the previous whiteboard mutation.", "L1"), () => {
      controller.dispatch({ type: "undo" });
      return summarizeBoard(controller.getState());
    }),
    tool(simpleDefinition("apply_style_preset", "Apply a visual preset such as minimalist, playful, or neon.", "L2"), (args) => {
      const input = readObject(args);
      controller.dispatch({ type: "applyStylePreset", preset: readPreset(input.preset) });
      return { preset: readPreset(input.preset) };
    }),
    tool(simpleDefinition("create_chart", "Create a simple bar chart visualization.", "L2"), (args) => {
      const input = readObject(args);
      const id = readString(input.id, createId("chart"));
      controller.dispatch({
        type: "createElement",
        element: createChartElement({
          id,
          title: readString(input.title, "Progress"),
          values: readNumberArray(input.values, [30, 60, 90]),
          labels: readStringArray(input.labels, ["A", "B", "C"]),
          x: readNumber(input.x, 320),
          y: readNumber(input.y, 320)
        })
      });
      return { id };
    }),
    tool(simpleDefinition("duplicate_element", "Duplicate an element with an offset.", "L2"), (args) => {
      const input = readObject(args);
      const id = readRequiredString(input.id, "id");
      const newId = readString(input.newId, createId(`${id}-copy`));
      controller.dispatch({
        type: "duplicateElement",
        id,
        newId,
        offsetX: readNumber(input.offsetX, 24),
        offsetY: readNumber(input.offsetY, 24)
      });
      return { id: newId };
    }),
    tool(simpleDefinition("align_elements", "Align elements by edge or center.", "L2"), (args) => {
      const input = readObject(args);
      const ids = readStringArray(input.ids, controller.getState().selectedIds);
      controller.dispatch({ type: "alignElements", ids, mode: readAlignMode(input.mode) });
      return { ids };
    }),
    tool({
      ...simpleDefinition("export_canvas", "Export the whiteboard as a PNG and trigger browser download.", "L3"),
      risk: "high"
    }, async (args) => {
      const input = readObject(args);
      const format = readString(input.format, "png") === "png" ? "png" : "png";
      const dataUrl = await controller.exportCanvas(format);
      return { format, dataUrl };
    }),
    tool({
      ...simpleDefinition("clear_canvas", "Clear all elements from the whiteboard.", "L3"),
      risk: "high"
    }, () => {
      controller.dispatch({ type: "clearCanvas" });
      return summarizeBoard(controller.getState());
    })
  ];
}

function simpleDefinition(name: string, description: string, level: "L1" | "L2" | "L3"): ToolDefinition {
  return {
    name,
    description,
    level,
    risk: level === "L3" ? "high" : "low",
    domain: "whiteboard",
    tags: [name.replaceAll("_", "-")],
    parameters: { type: "object", properties: {}, additionalProperties: true }
  };
}

function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function readObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function readRequiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required string: ${name}`);
  }
  return value;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readStringArray(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : fallback;
}

function readNumberArray(value: unknown, fallback: number[]): number[] {
  return Array.isArray(value) && value.every((item) => typeof item === "number") ? value : fallback;
}

function readShapeKind(value: unknown): "circle" | "rect" | "rounded_rect" {
  return value === "circle" || value === "rounded_rect" ? value : "rect";
}

function readTextAlign(value: unknown): "left" | "center" | "right" {
  return value === "center" || value === "right" ? value : "left";
}

function readArrangeDirection(value: unknown): ArrangeDirection {
  return value === "vertical" ? "vertical" : "horizontal";
}

function readAlignMode(value: unknown): AlignMode {
  return value === "left" || value === "right" || value === "top" || value === "middle" || value === "bottom"
    ? value
    : "center";
}

function readPreset(value: unknown): "minimalist" | "playful" | "neon" {
  return value === "playful" || value === "neon" ? value : "minimalist";
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
cd examples/ai-designer-board && pnpm test -- test/boardState.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run TypeScript check**

Run:

```bash
cd examples/ai-designer-board && pnpm lint
```

Expected: PASS or only reports not-yet-created React/server imports from later tasks. Fix `tools.ts` type errors before continuing.

- [ ] **Step 6: Checkpoint diff**

Run:

```bash
git diff -- examples/ai-designer-board/src/tools.ts examples/ai-designer-board/test/boardState.test.ts
```

Expected: diff contains the tool catalog, handler tests, and no public package API changes.

## Task 4: Server, DeepSeek Client, and Fallback Smoke Test

**Files:**
- Create: `examples/ai-designer-board/src/server.ts`
- Create: `examples/ai-designer-board/test/smoke.test.ts`

- [ ] **Step 1: Write failing smoke tests**

Create `examples/ai-designer-board/test/smoke.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createDesignerApp, ScriptedDesignerLLMClient } from "../src/server";

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
      expect(await shell.text()).toContain("AI Designer Board");
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

  it("scripted LLM returns assistant text after tool results", async () => {
    const client = new ScriptedDesignerLLMClient();
    const response = await client.chat({
      messages: [{ role: "tool", content: "{\"ok\":true}", toolCallId: "call-1" }],
      tools: []
    });

    expect(response.text).toContain("已完成");
  });
});
```

- [ ] **Step 2: Run smoke tests and verify failure**

Run:

```bash
cd examples/ai-designer-board && pnpm test -- test/smoke.test.ts
```

Expected: FAIL because `src/server.ts` does not exist.

- [ ] **Step 3: Implement server and LLM clients**

Create `examples/ai-designer-board/src/server.ts`:

```ts
import express from "express";
import {
  AgentEngine,
  InMemoryStore,
  LocalBroker,
  OpenAILLMClient,
  SessionManager,
  type ChatMessage,
  type LLMClient,
  type LLMRequest,
  type LLMResponse,
  type ToolCall,
  type ToolDefinition
} from "agent-remote-server-core";
import { createExpressAgentRouter } from "agent-remote-server-express";

const DESIGNER_SYSTEM_PROMPT = [
  "You are an AI designer controlling a browser whiteboard through tools.",
  "Prefer tool calls over prose when the user asks to draw, arrange, style, undo, or export.",
  "Call get_canvas_state before edits that depend on current elements.",
  "Use search_tools to discover advanced L2 tools when styling or chart requests need capabilities not visible initially.",
  "Keep explanations concise after tools complete."
].join(" ");

export interface CreateDesignerAppOptions {
  forceScriptedLLM?: boolean;
}

export class ScriptedDesignerLLMClient implements LLMClient {
  async chat(params: LLMRequest): Promise<LLMResponse> {
    const lastMessage = params.messages.at(-1);
    if (lastMessage?.role === "tool") {
      return { text: "已完成，我已经把画板更新好了。" };
    }

    const userText = [...params.messages].reverse().find((message) => message.role === "user")?.content.toLowerCase() ?? "";
    if (userText.includes("导出") || userText.includes("export")) {
      return { toolCalls: [toolCall("script-export", "export_canvas", { format: "png" })] };
    }
    if (userText.includes("撤销") || userText.includes("undo") || userText.includes("上一步")) {
      return { toolCalls: [toolCall("script-undo", "undo", {})] };
    }
    if (userText.includes("极简") || userText.includes("minimal")) {
      return {
        toolCalls: [
          toolCall("script-search-style", "search_tools", { query: "style preset", maxResults: 5 }),
          toolCall("script-style", "apply_style_preset", { preset: "minimalist" })
        ]
      };
    }
    if (userText.includes("渐变") || userText.includes("gradient") || userText.includes("均匀")) {
      return {
        toolCalls: [
          toolCall("script-gradient", "set_background_gradient", { from: "#111827", to: "#38bdf8" }),
          toolCall("script-arrange", "arrange_evenly", { ids: ["circle-hero", "text-hello"], direction: "horizontal" })
        ]
      };
    }
    return {
      toolCalls: [
        toolCall("script-circle", "create_shape", {
          id: "circle-hero",
          type: "circle",
          x: 480,
          y: 280,
          radius: 100,
          color: "blue"
        }),
        toolCall("script-text", "create_text", {
          id: "text-hello",
          content: "Hello World",
          x: 480,
          y: 430,
          fontSize: 24,
          align: "center"
        })
      ]
    };
  }
}

export class DeepSeekDesignerLLMClient implements LLMClient {
  private readonly fetchImpl: (url: string, init?: RequestInit) => Promise<Response>;

  constructor(
    private readonly options: {
      apiKey: string;
      baseUrl?: string;
      model?: string;
      fetch?: (url: string, init?: RequestInit) => Promise<Response>;
    }
  ) {
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async chat(params: LLMRequest): Promise<LLMResponse> {
    const response = await this.fetchImpl(`${this.options.baseUrl ?? "https://api.deepseek.com"}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: this.options.model ?? "deepseek-chat",
        messages: [
          { role: "system", content: DESIGNER_SYSTEM_PROMPT },
          ...params.messages.map(toOpenAIMessage)
        ],
        tools: params.tools.map(toOpenAITool)
      })
    });

    if (!response.ok) {
      throw new Error(`DeepSeek chat completion failed with status ${response.status}.`);
    }

    return readOpenAIResponse(await response.json());
  }
}

export function createDesignerApp(options: CreateDesignerAppOptions = {}) {
  const sessionManager = new SessionManager(new InMemoryStore(), new LocalBroker());
  const llmClient = createLLMClient(options);
  const engine = new AgentEngine({
    llmClient,
    sessionManager,
    observer: {
      onLLMRequest(sessionId, request) {
        console.log("[designer-demo] llm_request", { sessionId, messages: request.messages.length, tools: request.tools.length });
      },
      onLLMResponse(sessionId, response) {
        console.log("[designer-demo] llm_response", { sessionId, text: response.text, toolCalls: response.toolCalls?.map((call) => call.name) });
      },
      onToolCall(sessionId, call) {
        console.log("[designer-demo] tool_call", { sessionId, name: call.name, callId: call.callId });
      }
    }
  });
  const app = express();

  app.use(express.json({ limit: "2mb" }));
  app.get("/health", (_request, response) => {
    response.status(200).json({ ok: true });
  });
  app.get("/", (_request, response) => {
    response.type("html").send(createHtmlShell());
  });
  app.use(createExpressAgentRouter(engine, { heartbeatIntervalMs: 10_000 }));

  return { app, engine, sessionManager };
}

function createLLMClient(options: CreateDesignerAppOptions): LLMClient {
  if (!options.forceScriptedLLM && process.env.DEEPSEEK_API_KEY) {
    return new DeepSeekDesignerLLMClient({ apiKey: process.env.DEEPSEEK_API_KEY });
  }
  console.log("[designer-demo] using scripted LLM fallback");
  return new ScriptedDesignerLLMClient();
}

function createHtmlShell(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AI Designer Board</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/dist/App.js"></script>
  </body>
</html>`;
}

function toolCall(callId: string, name: string, args: unknown): ToolCall {
  return { callId, name, arguments: args };
}

function toOpenAITool(tool: ToolDefinition): unknown {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  };
}

function toOpenAIMessage(message: ChatMessage): unknown {
  if (message.role === "assistant" && message.toolCalls && message.toolCalls.length > 0) {
    return {
      role: "assistant",
      content: message.content.length > 0 ? message.content : null,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.callId,
        type: "function",
        function: { name: call.name, arguments: JSON.stringify(call.arguments ?? {}) }
      }))
    };
  }
  if (message.role === "tool") {
    return { role: "tool", tool_call_id: message.toolCallId, content: message.content };
  }
  return { role: message.role, content: message.content };
}

function readOpenAIResponse(body: unknown): LLMResponse {
  if (!isRecord(body) || !Array.isArray(body.choices)) {
    return {};
  }
  const [choice] = body.choices;
  if (!isRecord(choice) || !isRecord(choice.message)) {
    return {};
  }
  if (Array.isArray(choice.message.tool_calls)) {
    const toolCalls = choice.message.tool_calls.flatMap(readOpenAIToolCall);
    return toolCalls.length > 0 ? { toolCalls } : {};
  }
  return typeof choice.message.content === "string" ? { text: choice.message.content } : {};
}

function readOpenAIToolCall(input: unknown): ToolCall[] {
  if (!isRecord(input) || !isRecord(input.function)) {
    return [];
  }
  if (typeof input.id !== "string" || typeof input.function.name !== "string") {
    return [];
  }
  return [{
    callId: input.id,
    name: input.function.name,
    arguments: parseToolArguments(input.function.arguments)
  }];
}

function parseToolArguments(input: unknown): unknown {
  if (typeof input !== "string" || input.length === 0) {
    return {};
  }
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

if (process.env.NODE_ENV !== "test") {
  const { app } = createDesignerApp();
  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, () => {
    console.log(`AI Designer Board demo listening on http://localhost:${port}`);
  });
}
```

- [ ] **Step 4: Remove unused server import if TypeScript flags it**

If `OpenAILLMClient` is unused after implementation, remove it from the import list:

```ts
import {
  AgentEngine,
  InMemoryStore,
  LocalBroker,
  SessionManager,
  type ChatMessage,
  type LLMClient,
  type LLMRequest,
  type LLMResponse,
  type ToolCall,
  type ToolDefinition
} from "agent-remote-server-core";
```

- [ ] **Step 5: Run smoke tests**

Run:

```bash
cd examples/ai-designer-board && pnpm test -- test/smoke.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run package tests**

Run:

```bash
cd examples/ai-designer-board && pnpm test
```

Expected: PASS.

- [ ] **Step 7: Checkpoint diff**

Run:

```bash
git diff -- examples/ai-designer-board/src/server.ts examples/ai-designer-board/test/smoke.test.ts
```

Expected: server uses scripted fallback without requiring external credentials and does not expose `DEEPSEEK_API_KEY` to browser code.

## Task 5: React Konva Board

**Files:**
- Create: `examples/ai-designer-board/src/DesignerBoard.tsx`

- [ ] **Step 1: Implement board rendering component**

Create `examples/ai-designer-board/src/DesignerBoard.tsx`:

```tsx
import { forwardRef, useImperativeHandle, useRef } from "react";
import { Circle, Group, Layer, Rect, Stage, Text } from "react-konva";
import type Konva from "konva";
import type { BoardElement, BoardState, ChartElement, ShapeElement, TextElement } from "./boardState";

export interface DesignerBoardHandle {
  exportPng(): string;
}

export interface DesignerBoardProps {
  state: BoardState;
  onMove(id: string, x: number, y: number): void;
  onSelect(ids: string[]): void;
}

export const DesignerBoard = forwardRef<DesignerBoardHandle, DesignerBoardProps>(function DesignerBoard(
  { state, onMove, onSelect },
  ref
) {
  const stageRef = useRef<Konva.Stage>(null);

  useImperativeHandle(ref, () => ({
    exportPng() {
      return stageRef.current?.toDataURL({ mimeType: "image/png", pixelRatio: 2 }) ?? "";
    }
  }));

  return (
    <div className="board-frame">
      <Stage
        ref={stageRef}
        width={state.width}
        height={state.height}
        onMouseDown={(event) => {
          if (event.target === event.target.getStage()) {
            onSelect([]);
          }
        }}
      >
        <Layer>
          <BoardBackground state={state} />
          {state.elements.map((element) => (
            <BoardElementView
              key={element.id}
              element={element}
              selected={state.selectedIds.includes(element.id)}
              onMove={onMove}
              onSelect={onSelect}
            />
          ))}
        </Layer>
      </Stage>
    </div>
  );
});

function BoardBackground({ state }: { state: BoardState }) {
  const fill =
    state.background.type === "solid"
      ? state.background.color
      : {
          start: { x: 0, y: 0 },
          end: { x: state.width, y: state.height },
          colorStops: [0, state.background.from, 1, state.background.to]
        };

  if (typeof fill === "string") {
    return <Rect x={0} y={0} width={state.width} height={state.height} fill={fill} listening={false} />;
  }

  return (
    <Rect
      x={0}
      y={0}
      width={state.width}
      height={state.height}
      fillLinearGradientStartPoint={fill.start}
      fillLinearGradientEndPoint={fill.end}
      fillLinearGradientColorStops={fill.colorStops}
      listening={false}
    />
  );
}

function BoardElementView({
  element,
  selected,
  onMove,
  onSelect
}: {
  element: BoardElement;
  selected: boolean;
  onMove(id: string, x: number, y: number): void;
  onSelect(ids: string[]): void;
}) {
  if (element.kind === "shape") {
    return <ShapeView element={element} selected={selected} onMove={onMove} onSelect={onSelect} />;
  }
  if (element.kind === "text") {
    return <TextView element={element} selected={selected} onMove={onMove} onSelect={onSelect} />;
  }
  return <ChartView element={element} selected={selected} onMove={onMove} onSelect={onSelect} />;
}

function ShapeView({ element, selected, onMove, onSelect }: ElementProps<ShapeElement>) {
  const common = commonProps(element, selected, onMove, onSelect);
  if (element.shape === "circle") {
    return <Circle {...common} radius={element.radius ?? 60} fill={element.fill} stroke={selected ? "#f59e0b" : element.stroke} strokeWidth={selected ? 4 : 1} />;
  }
  return (
    <Rect
      {...common}
      width={element.width ?? 120}
      height={element.height ?? 80}
      cornerRadius={element.shape === "rounded_rect" ? element.cornerRadius ?? 16 : 0}
      fill={element.fill}
      stroke={selected ? "#f59e0b" : element.stroke}
      strokeWidth={selected ? 4 : 1}
    />
  );
}

function TextView({ element, selected, onMove, onSelect }: ElementProps<TextElement>) {
  return (
    <Text
      {...commonProps(element, selected, onMove, onSelect)}
      text={element.text}
      fontSize={element.fontSize}
      fill={element.fill}
      align={element.align}
      width={260}
      offsetX={element.align === "center" ? 130 : 0}
      stroke={selected ? "#f59e0b" : undefined}
      strokeWidth={selected ? 0.6 : 0}
    />
  );
}

function ChartView({ element, selected, onMove, onSelect }: ElementProps<ChartElement>) {
  const max = Math.max(...element.values, 1);
  const barWidth = element.width / Math.max(element.values.length, 1) - 12;
  return (
    <Group {...commonProps(element, selected, onMove, onSelect)}>
      <Rect width={element.width} height={element.height} fill="#ffffff" stroke={selected ? "#f59e0b" : "#cbd5e1"} cornerRadius={16} />
      <Text x={16} y={12} text={element.title} fontSize={16} fill="#0f172a" />
      {element.values.map((value, index) => {
        const height = (value / max) * 82;
        return (
          <Rect
            key={`${element.id}-${index}`}
            x={18 + index * (barWidth + 12)}
            y={element.height - height - 28}
            width={barWidth}
            height={height}
            fill={element.fill}
            cornerRadius={8}
          />
        );
      })}
    </Group>
  );
}

interface ElementProps<TElement extends BoardElement> {
  element: TElement;
  selected: boolean;
  onMove(id: string, x: number, y: number): void;
  onSelect(ids: string[]): void;
}

function commonProps<TElement extends BoardElement>(
  element: TElement,
  selected: boolean,
  onMove: (id: string, x: number, y: number) => void,
  onSelect: (ids: string[]) => void
) {
  return {
    x: element.x,
    y: element.y,
    rotation: element.rotation ?? 0,
    opacity: element.opacity ?? 1,
    draggable: true,
    shadowColor: selected ? "#f59e0b" : "rgba(15, 23, 42, 0.18)",
    shadowBlur: selected ? 12 : 8,
    shadowOpacity: selected ? 0.5 : 0.25,
    onClick: () => onSelect([element.id]),
    onTap: () => onSelect([element.id]),
    onDragEnd: (event: Konva.KonvaEventObject<DragEvent>) => onMove(element.id, event.target.x(), event.target.y())
  };
}
```

- [ ] **Step 2: Run TypeScript check**

Run:

```bash
cd examples/ai-designer-board && pnpm lint
```

Expected: any errors are limited to `App.tsx` not yet existing. Fix `DesignerBoard.tsx` type errors before continuing.

- [ ] **Step 3: Checkpoint diff**

Run:

```bash
git diff -- examples/ai-designer-board/src/DesignerBoard.tsx
```

Expected: component renders all element kinds and exposes `exportPng`.

## Task 6: React App and Tool Registration

**Files:**
- Create: `examples/ai-designer-board/src/App.tsx`
- Create: `examples/ai-designer-board/src/samplePrompts.ts`

- [ ] **Step 1: Add sample prompts**

Create `examples/ai-designer-board/src/samplePrompts.ts`:

```ts
export const SAMPLE_PROMPTS = [
  "帮我在画布中间放一个蓝色圆形，直径 200px，并在下方添加文字 Hello World，字号 24px，居中。",
  "把这几个元素水平均匀分布，并给背景加一个深蓝到天蓝的渐变。",
  "把整个画板变成极简风格，并添加一个小型进度图表。",
  "导出为 PNG 并下载。",
  "我不喜欢刚才的修改，回到上一步。"
] as const;
```

- [ ] **Step 2: Implement App**

Create `examples/ai-designer-board/src/App.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createSSEClient } from "agent-remote-client/sse";
import { useAgentClient } from "agent-remote-react";
import type { ToolCall, ToolDefinition } from "agent-remote-core";
import { boardReducer, createInitialBoardState, summarizeBoard } from "./boardState";
import { DesignerBoard, type DesignerBoardHandle } from "./DesignerBoard";
import { SAMPLE_PROMPTS } from "./samplePrompts";
import { createDesignerTools } from "./tools";
import "./styles.css";

interface ActivityItem {
  id: string;
  text: string;
}

interface PendingConfirmation {
  tool: ToolDefinition;
  call: ToolCall;
  resolve(accepted: boolean): void;
}

export function App() {
  const [boardState, dispatch] = useReducer(boardReducer, undefined, () => createInitialBoardState());
  const boardStateRef = useRef(boardState);
  const boardRef = useRef<DesignerBoardHandle>(null);
  const [prompt, setPrompt] = useState(SAMPLE_PROMPTS[0]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);

  useEffect(() => {
    boardStateRef.current = boardState;
  }, [boardState]);

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
      }, {
        confirmToolCall: (tool, call) =>
          new Promise<boolean>((resolve) => {
            setPendingConfirmation({ tool, call, resolve });
          })
      }),
    []
  );
  const agent = useAgentClient(createClient, { disconnectOnUnmount: true });

  const tools = useMemo(
    () =>
      createDesignerTools({
        getState: () => boardStateRef.current,
        dispatch: (action) => {
          dispatch(action);
          setActivities((items) => prependActivity(items, `工具执行: ${action.type}`));
        },
        exportCanvas: async () => {
          const dataUrl = boardRef.current?.exportPng() ?? "";
          downloadDataUrl(dataUrl, "ai-designer-board.png");
          return dataUrl;
        }
      }),
    []
  );

  useEffect(() => {
    for (const tool of tools) {
      agent?.registerTool(tool.definition, async (args) => {
        setActivities((items) => prependActivity(items, `调用工具: ${tool.definition.name}`));
        return tool.handler(args);
      });
    }
    void agent?.connect();
  }, [agent, tools]);

  async function sendPrompt(text = prompt) {
    if (!agent || !text.trim()) {
      return;
    }
    setActivities((items) => prependActivity(items, `用户: ${text}`));
    await agent.sendMessage(text);
  }

  function answerConfirmation(accepted: boolean) {
    pendingConfirmation?.resolve(accepted);
    setActivities((items) => prependActivity(items, accepted ? "已确认高风险工具" : "已拒绝高风险工具"));
    setPendingConfirmation(null);
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Agent Remote Demo</p>
          <h1>AI 设计师实时协作画板</h1>
          <p>后端 DeepSeek 负责思考，浏览器工具负责动手。你可以看到 Agent 直接创建、排版、撤销和导出画板内容。</p>
        </div>
        <div className="status-card">
          <span>连接状态</span>
          <strong>{agent?.status ?? "disabled"}</strong>
          <small>{agent?.lastMessage ?? "等待助手回复"}</small>
        </div>
      </section>

      <section className="workspace">
        <DesignerBoard
          ref={boardRef}
          state={boardState}
          onMove={(id, x, y) => dispatch({ type: "moveElement", id, x, y })}
          onSelect={(ids) => dispatch({ type: "selectElements", ids })}
        />

        <aside className="side-panel">
          <h2>和 AI 设计师对话</h2>
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={6} />
          <button type="button" className="primary" onClick={() => void sendPrompt()}>
            发送给 Agent
          </button>

          <div className="prompt-list">
            {SAMPLE_PROMPTS.map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => {
                  setPrompt(sample);
                  void sendPrompt(sample);
                }}
              >
                {sample}
              </button>
            ))}
          </div>

          <h3>画板摘要</h3>
          <pre>{JSON.stringify(summarizeBoard(boardState), null, 2)}</pre>

          <h3>活动日志</h3>
          <ul className="activity-list">
            {activities.map((item) => (
              <li key={item.id}>{item.text}</li>
            ))}
          </ul>
        </aside>
      </section>

      {pendingConfirmation ? (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>确认浏览器操作</h2>
            <p>Agent 请求执行高风险工具：{pendingConfirmation.tool.name}</p>
            <pre>{JSON.stringify(pendingConfirmation.call.arguments, null, 2)}</pre>
            <div className="modal-actions">
              <button type="button" onClick={() => answerConfirmation(false)}>
                拒绝
              </button>
              <button type="button" className="primary" onClick={() => answerConfirmation(true)}>
                确认执行
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function prependActivity(items: ActivityItem[], text: string): ActivityItem[] {
  return [{ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, text }, ...items].slice(0, 12);
}

function downloadDataUrl(dataUrl: string, filename: string): void {
  if (!dataUrl) {
    throw new Error("Canvas export returned an empty data URL.");
  }
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}
```

- [ ] **Step 3: Add CSS import target**

Create `examples/ai-designer-board/src/styles.css` in Task 7 before running a full build. For this task, TypeScript may complain if CSS modules are not supported by the current tsconfig. If that happens, remove `import "./styles.css";` temporarily and re-add it in Task 7 after verifying the bundler accepts it.

- [ ] **Step 4: Run TypeScript check**

Run:

```bash
cd examples/ai-designer-board && pnpm lint
```

Expected: PASS except for the missing `styles.css` import if not created yet. Fix all TypeScript errors before continuing.

- [ ] **Step 5: Checkpoint diff**

Run:

```bash
git diff -- examples/ai-designer-board/src/App.tsx examples/ai-designer-board/src/samplePrompts.ts
```

Expected: app registers all tools, connects over SSE, displays confirmation UI, and logs activity.

## Task 7: Styling and Browser Shell Asset Serving

**Files:**
- Create: `examples/ai-designer-board/src/styles.css`
- Modify: `examples/ai-designer-board/src/server.ts`

- [ ] **Step 1: Add UI styles**

Create `examples/ai-designer-board/src/styles.css`:

```css
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #0f172a;
  background: #e2e8f0;
}

button,
textarea {
  font: inherit;
}

.app-shell {
  min-height: 100vh;
  padding: 32px;
}

.hero {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 24px;
}

.hero h1 {
  margin: 0 0 12px;
  font-size: 40px;
}

.hero p {
  max-width: 760px;
  margin: 0;
  color: #475569;
}

.eyebrow {
  margin-bottom: 8px;
  color: #2563eb;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.status-card,
.side-panel,
.board-frame {
  border: 1px solid rgba(148, 163, 184, 0.5);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.86);
  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.14);
}

.status-card {
  min-width: 240px;
  padding: 20px;
}

.status-card span,
.status-card small {
  display: block;
  color: #64748b;
}

.status-card strong {
  display: block;
  margin: 8px 0;
  color: #16a34a;
  font-size: 24px;
}

.workspace {
  display: grid;
  grid-template-columns: minmax(680px, 1fr) 420px;
  gap: 24px;
  align-items: start;
}

.board-frame {
  overflow: auto;
  padding: 18px;
}

.side-panel {
  padding: 20px;
}

.side-panel h2,
.side-panel h3 {
  margin: 0 0 12px;
}

textarea {
  width: 100%;
  resize: vertical;
  border: 1px solid #cbd5e1;
  border-radius: 16px;
  padding: 14px;
  color: #0f172a;
}

button {
  cursor: pointer;
  border: 1px solid #cbd5e1;
  border-radius: 999px;
  padding: 10px 14px;
  color: #0f172a;
  background: #ffffff;
}

button.primary {
  border-color: #2563eb;
  color: #ffffff;
  background: #2563eb;
}

.side-panel > .primary {
  width: 100%;
  margin: 12px 0 18px;
}

.prompt-list {
  display: grid;
  gap: 8px;
  margin-bottom: 20px;
}

.prompt-list button {
  border-radius: 14px;
  text-align: left;
}

pre {
  max-height: 220px;
  overflow: auto;
  border-radius: 16px;
  padding: 12px;
  color: #dbeafe;
  background: #0f172a;
  font-size: 12px;
}

.activity-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.activity-list li {
  border-radius: 12px;
  padding: 10px;
  background: #f1f5f9;
  color: #475569;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.56);
}

.modal {
  width: min(520px, 100%);
  border-radius: 24px;
  padding: 24px;
  background: #ffffff;
  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.32);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

@media (max-width: 1180px) {
  .workspace,
  .hero {
    grid-template-columns: 1fr;
    display: grid;
  }
}
```

- [ ] **Step 2: Serve built assets from Express**

In `examples/ai-designer-board/src/server.ts`, add this import:

```ts
import path from "node:path";
import { fileURLToPath } from "node:url";
```

Add these constants after `DESIGNER_SYSTEM_PROMPT`:

```ts
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
```

In `createDesignerApp`, add static serving before `app.get("/")`:

```ts
app.use("/dist", express.static(path.join(__dirname)));
```

- [ ] **Step 3: Run build**

Run:

```bash
cd examples/ai-designer-board && pnpm build
```

Expected: PASS and `dist` includes bundled `server.js` and `App.js`.

- [ ] **Step 4: Run lint**

Run:

```bash
cd examples/ai-designer-board && pnpm lint
```

Expected: PASS.

- [ ] **Step 5: Checkpoint diff**

Run:

```bash
git diff -- examples/ai-designer-board/src/styles.css examples/ai-designer-board/src/server.ts
```

Expected: CSS is local to the example and server serves `dist` assets without changing Agent Remote routes.

## Task 8: README Documentation

**Files:**
- Create: `examples/ai-designer-board/README.md`
- Create: `examples/ai-designer-board/README.zh-CN.md`

- [ ] **Step 1: Write English README**

Create `examples/ai-designer-board/README.md`:

```md
# agent-remote-example-ai-designer-board

Language: English | [简体中文](README.zh-CN.md)

This example is an AI designer whiteboard. A server-side agent powered by DeepSeek can call browser-registered tools to create, arrange, style, undo, and export React Konva canvas elements.

It demonstrates why Agent Remote is useful:

- The model API key stays on the server.
- The browser exposes controlled whiteboard tools instead of raw DOM access.
- Tool calls stream from the server to the browser over SSE.
- High-risk browser actions use the client confirmation callback.
- L1 tools are visible immediately, while L2 tools can be discovered through `search_tools`.

## Run

From the repository root:

```bash
rush install
rush build
cd examples/ai-designer-board
pnpm dev
```

Open `http://localhost:3000`.

Without `DEEPSEEK_API_KEY`, the demo uses a scripted local LLM fallback. This keeps the example runnable in CI and for first-time contributors.

To use DeepSeek:

```bash
DEEPSEEK_API_KEY=your_key pnpm dev
```

The server uses `https://api.deepseek.com` and `deepseek-chat` by default.

## Try These Prompts

- `帮我在画布中间放一个蓝色圆形，直径 200px，并在下方添加文字 Hello World，字号 24px，居中。`
- `把这几个元素水平均匀分布，并给背景加一个深蓝到天蓝的渐变。`
- `把整个画板变成极简风格，并添加一个小型进度图表。`
- `导出为 PNG 并下载。`
- `我不喜欢刚才的修改，回到上一步。`

## Manual Verification

1. Run without `DEEPSEEK_API_KEY` and verify the scripted prompt creates visible canvas elements.
2. Run with `DEEPSEEK_API_KEY` and verify DeepSeek calls browser tools.
3. Trigger export and confirm the browser confirmation dialog.
4. Drag an element manually, then ask the agent to continue editing.
5. Ask for undo and verify the previous board state returns.

## Scripts

- `pnpm build`: bundle the server and React app with tsup.
- `pnpm dev`: run the Express server with tsx.
- `pnpm test`: run Vitest.
- `pnpm lint`: run `tsc --noEmit`.
```

- [ ] **Step 2: Write Chinese README**

Create `examples/ai-designer-board/README.zh-CN.md`:

```md
# agent-remote-example-ai-designer-board

语言：[English](README.md) | 简体中文

这是一个 AI 设计师实时协作画板示例。后端 Agent 接入 DeepSeek，前端在浏览器注册白板工具，Agent 可以通过 SSE 让浏览器创建、排版、美化、撤销和导出 React Konva 画板元素。

它展示了 Agent Remote 的核心价值：

- 模型 API Key 留在服务端，不暴露给浏览器。
- 浏览器只暴露受控白板工具，而不是开放任意 DOM 操作。
- 工具调用通过 SSE 从服务端实时推送到浏览器。
- 导出、清空等高风险操作会触发客户端确认回调。
- L1 工具直接暴露给模型，L2 高级工具可通过 `search_tools` 动态发现。

## 运行

从仓库根目录执行：

```bash
rush install
rush build
cd examples/ai-designer-board
pnpm dev
```

打开 `http://localhost:3000`。

如果没有配置 `DEEPSEEK_API_KEY`，示例会自动使用本地 scripted LLM fallback，因此 clone 后也能体验完整工具链。

使用 DeepSeek：

```bash
DEEPSEEK_API_KEY=your_key pnpm dev
```

服务端默认使用 `https://api.deepseek.com` 和 `deepseek-chat`。

## 推荐试用 Prompt

- `帮我在画布中间放一个蓝色圆形，直径 200px，并在下方添加文字 Hello World，字号 24px，居中。`
- `把这几个元素水平均匀分布，并给背景加一个深蓝到天蓝的渐变。`
- `把整个画板变成极简风格，并添加一个小型进度图表。`
- `导出为 PNG 并下载。`
- `我不喜欢刚才的修改，回到上一步。`

## 手动验证

1. 不配置 `DEEPSEEK_API_KEY` 启动，确认 scripted prompt 会创建可见画布元素。
2. 配置 `DEEPSEEK_API_KEY` 启动，确认 DeepSeek 会调用浏览器工具。
3. 触发导出，确认浏览器出现高风险操作确认框。
4. 手动拖拽元素后，再让 Agent 继续编辑。
5. 请求撤销，确认画板回到上一步状态。

## 脚本

- `pnpm build`: 使用 tsup 构建服务端和 React 应用。
- `pnpm dev`: 使用 tsx 运行 Express 服务。
- `pnpm test`: 运行 Vitest。
- `pnpm lint`: 运行 `tsc --noEmit`。
```

- [ ] **Step 3: Check docs for stale commands**

Run:

```bash
rg "ai-designer-board|DEEPSEEK_API_KEY|pnpm dev" examples/ai-designer-board/README.md examples/ai-designer-board/README.zh-CN.md
```

Expected: both READMEs mention the example name, DeepSeek key, and dev command.

- [ ] **Step 4: Checkpoint diff**

Run:

```bash
git diff -- examples/ai-designer-board/README.md examples/ai-designer-board/README.zh-CN.md
```

Expected: docs explain fallback, DeepSeek mode, high-risk confirmation, and Agent Remote value.

## Task 9: Full Verification and Repo Integration

**Files:**
- Modify: `examples/ai-designer-board/src/boardState.ts`
- Modify: `examples/ai-designer-board/src/tools.ts`
- Modify: `examples/ai-designer-board/src/DesignerBoard.tsx`
- Modify: `examples/ai-designer-board/src/App.tsx`
- Modify: `examples/ai-designer-board/src/server.ts`
- Modify: `examples/ai-designer-board/test/boardState.test.ts`
- Modify: `examples/ai-designer-board/test/smoke.test.ts`

- [ ] **Step 1: Run package tests**

Run:

```bash
cd examples/ai-designer-board && pnpm test
```

Expected: PASS.

- [ ] **Step 2: Run package lint**

Run:

```bash
cd examples/ai-designer-board && pnpm lint
```

Expected: PASS.

- [ ] **Step 3: Run package build**

Run:

```bash
cd examples/ai-designer-board && pnpm build
```

Expected: PASS.

- [ ] **Step 4: Run Rush targeted test**

Run:

```bash
rush test -t agent-remote-example-ai-designer-board
```

Expected: PASS without `DEEPSEEK_API_KEY`.

- [ ] **Step 5: Run Rush build**

Run:

```bash
rush build
```

Expected: PASS.

- [ ] **Step 6: Inspect final diff**

Run:

```bash
git diff --stat
git diff -- examples/ai-designer-board rush.json common/config/rush/pnpm-lock.yaml docs/superpowers/specs/2026-05-25-ai-designer-board-design.md docs/superpowers/plans/2026-05-25-ai-designer-board.md
```

Expected: changes are limited to the new example, Rush registration/lockfile, and superpowers docs.

- [ ] **Step 7: Read lints for edited files**

Use IDE diagnostics for:

```text
examples/ai-designer-board/src/boardState.ts
examples/ai-designer-board/src/tools.ts
examples/ai-designer-board/src/DesignerBoard.tsx
examples/ai-designer-board/src/App.tsx
examples/ai-designer-board/src/server.ts
```

Expected: no introduced diagnostics. Fix any diagnostics that are clearly caused by the new work.

## Self-Review

- Spec coverage: tasks cover new Rush package, DeepSeek/fallback LLM, React Konva board, 10+ tools, L1/L2/L3 levels, high-risk confirmation, docs, and CI-friendly tests.
- Red-flag scan: the plan avoids open-ended filler and names exact files, commands, and expected outcomes.
- Type consistency: `BoardState`, `BoardAction`, `DesignerToolController`, and tool names are introduced before later tasks use them.
- Constraint check: implementation stays within SSE only and avoids public Agent Remote API changes.
- Git safety: plan includes diff checkpoints but no commit commands because commits require explicit user approval in this environment.
