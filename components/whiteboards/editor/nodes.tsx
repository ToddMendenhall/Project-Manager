"use client";

import { memo, useEffect, useRef, useState, type CSSProperties } from "react";
import { ImageOff } from "lucide-react";
import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import { HANDLE_IDS, PALETTE } from "@/lib/whiteboard";
import { DEFAULT_FONT_SIZE, useEditor, type WbNode } from "./model";

const HANDLE_POSITIONS: Record<(typeof HANDLE_IDS)[number], Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

/**
 * One handle per side. They're all `source` handles because the canvas
 * runs in ConnectionMode.Loose, where any handle can start or end a
 * connector — so a process map can be wired in either direction.
 */
function SideHandles() {
  return (
    <>
      {HANDLE_IDS.map((id) => (
        <Handle key={id} id={id} type="source" position={HANDLE_POSITIONS[id]} className="wb-handle" />
      ))}
    </>
  );
}

function Resizer({
  selected,
  minWidth,
  minHeight,
  keepAspectRatio,
}: {
  selected: boolean;
  minWidth: number;
  minHeight: number;
  keepAspectRatio?: boolean;
}) {
  const { editingId, beginInteraction, endInteraction } = useEditor();
  return (
    <NodeResizer
      isVisible={selected && editingId === null}
      minWidth={minWidth}
      minHeight={minHeight}
      keepAspectRatio={keepAspectRatio}
      color="#0071bc"
      handleClassName="wb-resize-handle"
      onResizeStart={beginInteraction}
      onResizeEnd={endInteraction}
    />
  );
}

/** Node text: plain display, or a textarea while this node is being edited (double-click / Enter). */
function EditableText({
  id,
  text,
  placeholder,
  className,
  style,
}: {
  id: string;
  text: string;
  placeholder: string;
  className: string;
  style: CSSProperties;
}) {
  const { editingId, setEditingId, commitNodeText } = useEditor();
  const editing = editingId === id;
  const [draft, setDraft] = useState(text);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(text);
      const el = ref.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    }
    // Only reset the draft when editing starts, not on every text change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  if (editing) {
    return (
      <textarea
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          commitNodeText(id, draft);
          setEditingId(null);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) {
            e.currentTarget.blur();
          }
        }}
        aria-label="Edit text"
        className={`nodrag nowheel nopan resize-none bg-transparent outline-none ${className}`}
        style={style}
      />
    );
  }

  return (
    <div className={`overflow-hidden whitespace-pre-wrap break-words ${className}`} style={style}>
      {text || <span className="opacity-40">{placeholder}</span>}
    </div>
  );
}

export const StickyNode = memo(function StickyNode({ id, data, selected }: NodeProps<WbNode>) {
  const color = PALETTE[data.color];
  return (
    <div
      className="h-full w-full rounded-sm shadow-md"
      style={{ background: color.fill, outline: selected ? "2px solid #0071bc" : undefined, outlineOffset: 2 }}
    >
      <Resizer selected={!!selected} minWidth={60} minHeight={60} />
      <SideHandles />
      <EditableText
        id={id}
        text={data.text}
        placeholder="Type something…"
        className="flex h-full w-full items-center justify-center p-3 text-center leading-snug text-cy-gray-900"
        style={{ fontSize: data.fontSize ?? DEFAULT_FONT_SIZE.sticky }}
      />
    </div>
  );
});

export const ShapeNode = memo(function ShapeNode({ id, data, selected }: NodeProps<WbNode>) {
  const color = PALETTE[data.color];
  const shape = data.shape ?? "rectangle";
  const stroke = selected ? "#0071bc" : color.stroke;

  // Rect-like shapes are CSS boxes; diamond/parallelogram are SVG polygons
  // stretched to the node box (non-scaling stroke keeps the border width).
  const polygon =
    shape === "diamond" ? "50,1 99,50 50,99 1,50" : shape === "parallelogram" ? "18,1 99,1 82,99 1,99" : null;
  const radius = shape === "rounded" ? 9999 : shape === "ellipse" ? "50%" : 3;
  // Keep text inside the visible area of the narrower shapes.
  const padding = shape === "diamond" ? "18% 22%" : shape === "parallelogram" ? "8px 18%" : "8px 12px";

  return (
    <div className="relative h-full w-full">
      <Resizer selected={!!selected} minWidth={40} minHeight={30} />
      <SideHandles />
      {polygon ? (
        <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polygon
            points={polygon}
            fill={color.fill}
            stroke={stroke}
            strokeWidth={selected ? 2 : 1.5}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: color.fill, border: `${selected ? 2 : 1.5}px solid ${stroke}`, borderRadius: radius }}
        />
      )}
      <EditableText
        id={id}
        text={data.text}
        placeholder=""
        className="relative flex h-full w-full items-center justify-center text-center leading-snug text-cy-gray-900"
        style={{ fontSize: data.fontSize ?? DEFAULT_FONT_SIZE.shape, padding }}
      />
    </div>
  );
});

export const TextNode = memo(function TextNode({ id, data, selected }: NodeProps<WbNode>) {
  return (
    <div
      className="h-full w-full rounded-sm"
      style={{ outline: selected ? "1.5px dashed #0071bc" : undefined, outlineOffset: 2 }}
    >
      <Resizer selected={!!selected} minWidth={40} minHeight={20} />
      <SideHandles />
      <EditableText
        id={id}
        text={data.text}
        placeholder="Add text"
        className="h-full w-full px-1 leading-snug"
        style={{
          fontSize: data.fontSize ?? DEFAULT_FONT_SIZE.text,
          color: data.color === "white" ? PALETTE.white.stroke : PALETTE[data.color].stroke,
        }}
      />
    </div>
  );
});

/**
 * A titled region — a section, or one lane of a swimlane map. Dragging it
 * carries along every node inside its box (see onNodeDragStart in the
 * editor); it renders beneath other nodes (FRAME_LAYER_OFFSET). Its title
 * is edited by double-clicking it; double-clicking the body drops a sticky.
 */
export const FrameNode = memo(function FrameNode({ id, data, selected }: NodeProps<WbNode>) {
  const color = PALETTE[data.color];
  return (
    <div
      className="h-full w-full rounded-card"
      style={{
        // 8-digit hex: the palette fill at ~45% opacity, so the dot grid shows through.
        background: `${color.fill}73`,
        border: `${selected ? 2 : 1}px solid ${selected ? "#0071bc" : color.stroke}66`,
      }}
    >
      <Resizer selected={!!selected} minWidth={120} minHeight={80} />
      <SideHandles />
      <EditableText
        id={id}
        text={data.text}
        placeholder="Untitled frame"
        className="wb-frame-title w-full truncate px-3 py-2 font-semibold"
        style={{
          fontSize: data.fontSize ?? DEFAULT_FONT_SIZE.frame,
          color: color.stroke,
          height: (data.fontSize ?? DEFAULT_FONT_SIZE.frame) * 1.4 + 16,
        }}
      />
    </div>
  );
});

/** Smooth path through the stroke's points: quadratic curves via each midpoint. */
function strokePath(points: [number, number][]) {
  if (points.length === 1) {
    const [x, y] = points[0];
    return `M ${x} ${y} L ${x + 0.01} ${y}`;
  }
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i];
    const [nx, ny] = points[i + 1];
    d += ` Q ${x} ${y} ${(x + nx) / 2} ${(y + ny) / 2}`;
  }
  const [lx, ly] = points[points.length - 1];
  return `${d} L ${lx} ${ly}`;
}

/**
 * A freehand pen or highlighter stroke. Only the stroke itself is
 * clickable (the node box is pointer-events: none in whiteboard.css), so
 * strokes don't block clicks on whatever is under their bounding box.
 */
export const DrawingNode = memo(function DrawingNode({ data, selected }: NodeProps<WbNode>) {
  const points = data.points ?? [];
  const d = strokePath(points);
  const color = PALETTE[data.color].stroke;
  const strokeWidth = data.strokeWidth ?? 3;
  return (
    <div className="h-full w-full" style={{ outline: selected ? "1.5px dashed #0071bc" : undefined, outlineOffset: 2 }}>
      <Resizer selected={!!selected} minWidth={8} minHeight={8} />
      <svg
        className="h-full w-full overflow-visible"
        viewBox={`0 0 ${data.pathWidth ?? 1} ${data.pathHeight ?? 1}`}
        preserveAspectRatio="none"
      >
        {/* Wide invisible twin of the stroke, so thin lines are easy to click. */}
        <path d={d} className="wb-stroke-hit" fill="none" stroke="transparent" strokeWidth={Math.max(strokeWidth, 14)} strokeLinecap="round" strokeLinejoin="round" />
        <path
          d={d}
          className="wb-stroke-hit"
          fill="none"
          stroke={color}
          strokeOpacity={data.highlight ? 0.4 : 1}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
});

export const ImageNode = memo(function ImageNode({ data, selected }: NodeProps<WbNode>) {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className="h-full w-full"
      style={{ outline: selected ? "2px solid #0071bc" : undefined, outlineOffset: 2 }}
    >
      <Resizer selected={!!selected} minWidth={20} minHeight={20} keepAspectRatio />
      <SideHandles />
      {failed || !data.attachmentId ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 rounded border border-dashed border-cy-gray-300 bg-cy-gray-050 text-xs text-cy-gray-500">
          <ImageOff size={18} />
          Image unavailable
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- an authenticated API route, not a static asset
        <img
          src={`/api/attachments/${data.attachmentId}`}
          alt=""
          draggable={false}
          onError={() => setFailed(true)}
          className="h-full w-full select-none object-fill"
        />
      )}
    </div>
  );
});

export const nodeTypes = {
  sticky: StickyNode,
  shape: ShapeNode,
  text: TextNode,
  frame: FrameNode,
  drawing: DrawingNode,
  image: ImageNode,
};
