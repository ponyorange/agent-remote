import { forwardRef, useImperativeHandle, useRef } from "react";
import type Konva from "konva";
import { Circle, Group, Layer, Rect, Stage, Text } from "react-konva";
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
  if (state.background.type === "solid") {
    return <Rect x={0} y={0} width={state.width} height={state.height} fill={state.background.color} listening={false} />;
  }

  return (
    <Rect
      x={0}
      y={0}
      width={state.width}
      height={state.height}
      fillLinearGradientStartPoint={{ x: 0, y: 0 }}
      fillLinearGradientEndPoint={{ x: state.width, y: state.height }}
      fillLinearGradientColorStops={[0, state.background.from, 1, state.background.to]}
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
    return (
      <Circle
        {...common}
        radius={element.radius ?? 60}
        fill={element.fill}
        stroke={selected ? "#f59e0b" : element.stroke}
        strokeWidth={selected ? 4 : 1}
      />
    );
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
      <Rect
        width={element.width}
        height={element.height}
        fill="#ffffff"
        stroke={selected ? "#f59e0b" : "#cbd5e1"}
        cornerRadius={16}
      />
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
