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

export type BoardElementPatch = Partial<
  Omit<ShapeElement, "id" | "kind"> &
    Omit<TextElement, "id" | "kind"> &
    Omit<ChartElement, "id" | "kind">
>;

export type BoardAction =
  | { type: "createElement"; element: BoardElement }
  | { type: "updateElement"; id: string; patch: BoardElementPatch }
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

export function createShapeElement(
  input: Partial<ShapeElement> & Pick<ShapeElement, "id" | "shape" | "x" | "y">
): ShapeElement {
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

export function createTextElement(
  input: Partial<TextElement> & Pick<TextElement, "id" | "text" | "x" | "y">
): TextElement {
  return {
    kind: "text",
    fontSize: 24,
    fill: "#111827",
    align: "left",
    opacity: 1,
    ...input
  };
}

export function createChartElement(
  input: Partial<ChartElement> & Pick<ChartElement, "id" | "title" | "values" | "labels" | "x" | "y">
): ChartElement {
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
        ]
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

export function arrangeElementsEvenly(
  elements: BoardElement[],
  ids: string[],
  direction: ArrangeDirection
): BoardElement[] {
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

  const anchorBounds = getElementBounds(selected[0]);
  return elements.map((element) => {
    if (!ids.includes(element.id)) {
      return element;
    }

    const bounds = getElementBounds(element);
    switch (mode) {
      case "left":
        return moveElementBounds(element, anchorBounds.left, bounds.top);
      case "center":
        return moveElementBounds(element, anchorBounds.centerX - bounds.width / 2, bounds.top);
      case "right":
        return moveElementBounds(element, anchorBounds.right - bounds.width, bounds.top);
      case "top":
        return moveElementBounds(element, bounds.left, anchorBounds.top);
      case "middle":
        return moveElementBounds(element, bounds.left, anchorBounds.centerY - bounds.height / 2);
      case "bottom":
        return moveElementBounds(element, bounds.left, anchorBounds.bottom - bounds.height);
      default:
        return element;
    }
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
    playful: {
      background: { type: "linear-gradient" as const, from: "#fef3c7", to: "#f9a8d4" },
      fill: "#f97316",
      text: "#7c2d12"
    },
    neon: {
      background: { type: "linear-gradient" as const, from: "#020617", to: "#312e81" },
      fill: "#22d3ee",
      text: "#f8fafc"
    }
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

interface ElementBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

function getElementBounds(element: BoardElement): ElementBounds {
  if (element.kind === "shape" && element.shape === "circle") {
    const radius = element.radius ?? 60;
    return createBounds(element.x - radius, element.y - radius, radius * 2, radius * 2);
  }
  if (element.kind === "text") {
    const size = getElementSize(element);
    const left = element.align === "center" ? element.x - size.width / 2 : element.x;
    return createBounds(left, element.y, size.width, size.height);
  }

  const size = getElementSize(element);
  return createBounds(element.x, element.y, size.width, size.height);
}

function getElementSize(element: BoardElement): { width: number; height: number } {
  if (element.kind === "shape") {
    return {
      width: element.width ?? (element.radius ? element.radius * 2 : 120),
      height: element.height ?? (element.radius ? element.radius * 2 : 80)
    };
  }
  if (element.kind === "chart") {
    return { width: element.width, height: element.height };
  }
  return { width: 260, height: element.fontSize };
}

function createBounds(left: number, top: number, width: number, height: number): ElementBounds {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    centerX: left + width / 2,
    centerY: top + height / 2
  };
}

function moveElementBounds(element: BoardElement, left: number, top: number): BoardElement {
  if (element.kind === "shape" && element.shape === "circle") {
    const radius = element.radius ?? 60;
    return { ...element, x: left + radius, y: top + radius };
  }
  if (element.kind === "text" && element.align === "center") {
    return { ...element, x: left + getElementSize(element).width / 2, y: top };
  }
  return { ...element, x: left, y: top };
}
