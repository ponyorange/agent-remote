import type { ToolDefinition } from "agent-remote-core";
import {
  type AlignMode,
  type ArrangeDirection,
  type BoardAction,
  type BoardState,
  type BoardElementPatch,
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
  dispatch(action: BoardAction): BoardState;
  exportCanvas(format: "png"): Promise<string>;
}

export function createDesignerTools(controller: DesignerToolController): DesignerTool[] {
  const tool = (definition: ToolDefinition, handler: DesignerTool["handler"]): DesignerTool => ({ definition, handler });

  return [
    tool(
      {
        name: "get_canvas_state",
        description: "Read the current whiteboard state, including canvas size, background, selected IDs, and element summaries.",
        level: "L1",
        risk: "low",
        domain: "whiteboard",
        tags: ["state", "read"],
        parameters: { type: "object", properties: {} }
      },
      () => summarizeBoard(controller.getState())
    ),
    tool(
      {
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
      },
      (args) => {
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
      }
    ),
    tool(
      {
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
      },
      (args) => {
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
      }
    ),
    tool(
      simpleDefinition("update_element", "Update common visual properties on an existing element.", "L1", {
        type: "object",
        properties: {
          id: { type: "string" },
          patch: {
            type: "object",
            properties: {
              fill: { type: "string" },
              text: { type: "string" },
              fontSize: { type: "number" },
              rotation: { type: "number" },
              opacity: { type: "number" }
            },
            additionalProperties: true
          }
        },
        required: ["id", "patch"]
      }),
      (args) => {
        const input = readObject(args);
        const id = readRequiredString(input.id, "id");
        controller.dispatch({ type: "updateElement", id, patch: readObject(input.patch) as BoardElementPatch });
        return { id };
      }
    ),
    tool(
      simpleDefinition("move_element", "Move an element to an absolute x/y position.", "L1", {
        type: "object",
        properties: {
          id: { type: "string" },
          x: { type: "number" },
          y: { type: "number" }
        },
        required: ["id", "x", "y"]
      }),
      (args) => {
        const input = readObject(args);
        const id = readRequiredString(input.id, "id");
        controller.dispatch({ type: "moveElement", id, x: readNumber(input.x, 0), y: readNumber(input.y, 0) });
        return { id };
      }
    ),
    tool(simpleDefinition("delete_element", "Delete one element by ID.", "L1", idSchema()), (args) => {
      const input = readObject(args);
      const id = readRequiredString(input.id, "id");
      controller.dispatch({ type: "deleteElement", id });
      return { id };
    }),
    tool(
      simpleDefinition("arrange_evenly", "Distribute elements evenly horizontally or vertically.", "L1", {
        type: "object",
        properties: {
          ids: { type: "array", items: { type: "string" } },
          direction: { type: "string", enum: ["horizontal", "vertical"] }
        },
        required: ["ids", "direction"]
      }),
      (args) => {
        const input = readObject(args);
        const ids = readStringArray(input.ids, controller.getState().selectedIds);
        controller.dispatch({ type: "arrangeEvenly", ids, direction: readArrangeDirection(input.direction) });
        return { ids };
      }
    ),
    tool(
      simpleDefinition("set_background_gradient", "Set a linear gradient background.", "L1", {
        type: "object",
        properties: {
          from: { type: "string" },
          to: { type: "string" }
        },
        required: ["from", "to"]
      }),
      (args) => {
        const input = readObject(args);
        const nextState = controller.dispatch({
          type: "setBackground",
          background: {
            type: "linear-gradient",
            from: readString(input.from, "#111827"),
            to: readString(input.to, "#38bdf8")
          }
        });
        return { background: nextState.background };
      }
    ),
    tool(simpleDefinition("undo", "Undo the previous whiteboard mutation.", "L1"), () => {
      return summarizeBoard(controller.dispatch({ type: "undo" }));
    }),
    tool(
      simpleDefinition("apply_style_preset", "Apply a visual preset such as minimalist, playful, or neon.", "L2", {
        type: "object",
        properties: { preset: { type: "string", enum: ["minimalist", "playful", "neon"] } },
        required: ["preset"]
      }),
      (args) => {
        const input = readObject(args);
        const preset = readPreset(input.preset);
        controller.dispatch({ type: "applyStylePreset", preset });
        return { preset };
      }
    ),
    tool(
      simpleDefinition("create_chart", "Create a simple bar chart visualization.", "L2", {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          values: { type: "array", items: { type: "number" } },
          labels: { type: "array", items: { type: "string" } },
          x: { type: "number" },
          y: { type: "number" }
        },
        required: ["title", "values", "labels", "x", "y"]
      }),
      (args) => {
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
      }
    ),
    tool(
      simpleDefinition("duplicate_element", "Duplicate an element with an offset.", "L2", {
        type: "object",
        properties: {
          id: { type: "string" },
          newId: { type: "string" },
          offsetX: { type: "number" },
          offsetY: { type: "number" }
        },
        required: ["id"]
      }),
      (args) => {
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
      }
    ),
    tool(
      simpleDefinition("align_elements", "Align elements by edge or center.", "L2", {
        type: "object",
        properties: {
          ids: { type: "array", items: { type: "string" } },
          mode: { type: "string", enum: ["left", "center", "right", "top", "middle", "bottom"] }
        },
        required: ["ids", "mode"]
      }),
      (args) => {
        const input = readObject(args);
        const ids = readStringArray(input.ids, controller.getState().selectedIds);
        controller.dispatch({ type: "alignElements", ids, mode: readAlignMode(input.mode) });
        return { ids };
      }
    ),
    tool(
      {
        ...simpleDefinition("export_canvas", "Export the whiteboard as a PNG and trigger browser download.", "L3", {
          type: "object",
          properties: { format: { type: "string", enum: ["png"] } },
          required: ["format"]
        }),
        risk: "high"
      },
      async (args) => {
        const input = readObject(args);
        const format = readString(input.format, "png") === "png" ? "png" : "png";
        const dataUrl = await controller.exportCanvas(format);
        return { format, dataUrl };
      }
    ),
    tool(
      {
        ...simpleDefinition("clear_canvas", "Clear all elements from the whiteboard.", "L3"),
        risk: "high"
      },
      () => {
        return summarizeBoard(controller.dispatch({ type: "clearCanvas" }));
      }
    )
  ];
}

function simpleDefinition(
  name: string,
  description: string,
  level: "L1" | "L2" | "L3",
  parameters: ToolDefinition["parameters"] = { type: "object", properties: {} }
): ToolDefinition {
  return {
    name,
    description,
    level,
    risk: level === "L3" ? "high" : "low",
    domain: "whiteboard",
    tags: [name.replace(/_/g, "-")],
    parameters
  };
}

function idSchema(): ToolDefinition["parameters"] {
  return {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"]
  };
}

function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function readObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
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
