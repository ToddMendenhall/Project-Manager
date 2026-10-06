"use client";

import type { ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Circle,
  Copy,
  Diamond,
  Frame,
  Hand,
  Highlighter,
  ImagePlus,
  MousePointer2,
  PenLine,
  Redo2,
  RectangleHorizontal,
  Square,
  StickyNote,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";
import {
  COLOR_KEYS,
  EDGE_ARROWS,
  EDGE_ROUTINGS,
  FONT_SIZES,
  PALETTE,
  SHAPE_KINDS,
  SHAPE_LABELS,
  type ColorKey,
  type EdgeArrow,
  type EdgeRouting,
  type ShapeKind,
} from "@/lib/whiteboard";
import type { Tool } from "./model";
import type { AlignAction } from "./geometry";

function ParallelogramIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M7 5h15l-5 14H2z" strokeLinejoin="round" />
    </svg>
  );
}

const SHAPE_ICONS: Record<ShapeKind, ReactNode> = {
  rectangle: <Square size={16} />,
  rounded: <RectangleHorizontal size={16} />,
  ellipse: <Circle size={16} />,
  diamond: <Diamond size={16} />,
  parallelogram: <ParallelogramIcon />,
};

const SHAPE_SHORTCUTS: Partial<Record<ShapeKind, string>> = { rectangle: "R", ellipse: "O", diamond: "D" };

function ToolButton({
  label,
  shortcut,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const title = shortcut ? `${label} (${shortcut})` : label;
  return (
    <button
      type="button"
      title={title}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded transition-colors duration-fast disabled:opacity-30 ${
        active ? "bg-cy-blue-600 text-white" : "text-cy-gray-700 hover:bg-cy-gray-050"
      }`}
    >
      {children}
    </button>
  );
}

const Divider = ({ vertical }: { vertical?: boolean }) =>
  vertical ? <span className="mx-1 h-5 w-px bg-cy-gray-100" /> : <span className="my-1 h-px w-6 bg-cy-gray-100" />;

/** The vertical tool palette on the canvas's left edge. */
export function ToolPalette({
  tool,
  onTool,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onImage,
  imageBusy,
}: {
  tool: Tool;
  onTool: (tool: Tool) => void;
  onImage: () => void;
  imageBusy: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  return (
    // Anchored to the top and capped so it never covers the zoom controls in the bottom-left corner.
    <div className="absolute left-3 top-3 z-10 flex max-h-[calc(100%-170px)] flex-col items-center gap-0.5 overflow-y-auto rounded-card border border-cy-gray-100 bg-white p-1 shadow-md">
      <ToolButton label="Select" shortcut="V" active={tool === "select"} onClick={() => onTool("select")}>
        <MousePointer2 size={16} />
      </ToolButton>
      <ToolButton label="Pan" shortcut="H" active={tool === "hand"} onClick={() => onTool("hand")}>
        <Hand size={16} />
      </ToolButton>
      <Divider />
      <ToolButton label="Sticky note" shortcut="S" active={tool === "sticky"} onClick={() => onTool("sticky")}>
        <StickyNote size={16} />
      </ToolButton>
      <ToolButton label="Text" shortcut="T" active={tool === "text"} onClick={() => onTool("text")}>
        <Type size={16} />
      </ToolButton>
      {SHAPE_KINDS.map((shape) => (
        <ToolButton
          key={shape}
          label={SHAPE_LABELS[shape]}
          shortcut={SHAPE_SHORTCUTS[shape]}
          active={tool === `shape:${shape}`}
          onClick={() => onTool(`shape:${shape}`)}
        >
          {SHAPE_ICONS[shape]}
        </ToolButton>
      ))}
      <ToolButton label="Frame" shortcut="F" active={tool === "frame"} onClick={() => onTool("frame")}>
        <Frame size={16} />
      </ToolButton>
      <Divider />
      <ToolButton label="Pen" shortcut="P" active={tool === "pen"} onClick={() => onTool("pen")}>
        <PenLine size={16} />
      </ToolButton>
      <ToolButton label="Highlighter" shortcut="M" active={tool === "highlighter"} onClick={() => onTool("highlighter")}>
        <Highlighter size={16} />
      </ToolButton>
      <ToolButton label={imageBusy ? "Uploading image…" : "Image"} shortcut="I" disabled={imageBusy} onClick={onImage}>
        <ImagePlus size={16} />
      </ToolButton>
      <Divider />
      <ToolButton label="Undo" shortcut="Ctrl+Z" disabled={!canUndo} onClick={onUndo}>
        <Undo2 size={16} />
      </ToolButton>
      <ToolButton label="Redo" shortcut="Ctrl+Shift+Z" disabled={!canRedo} onClick={onRedo}>
        <Redo2 size={16} />
      </ToolButton>
    </div>
  );
}

function Swatches({ value, onChange }: { value: ColorKey | null; onChange: (color: ColorKey) => void }) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Color">
      {COLOR_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          title={PALETTE[key].label}
          aria-label={PALETTE[key].label}
          onClick={() => onChange(key)}
          className={`h-5 w-5 rounded-full border ${value === key ? "ring-2 ring-cy-blue-600 ring-offset-1" : ""}`}
          style={{ background: PALETTE[key].fill, borderColor: PALETTE[key].stroke }}
        />
      ))}
    </div>
  );
}

const ROUTING_LABELS: Record<EdgeRouting, string> = { curved: "Curved", elbow: "Elbow", straight: "Straight" };
const ARROW_LABELS: Record<EdgeArrow, string> = { end: "Arrow →", both: "Arrows ↔", none: "No arrow" };

const selectClass =
  "rounded border border-cy-gray-200 bg-white px-1.5 py-1 text-xs text-cy-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cy-cyan-500";

const ALIGN_OPTIONS: { value: AlignAction; label: string }[] = [
  { value: "left", label: "Align left" },
  { value: "center", label: "Align centers horizontally" },
  { value: "right", label: "Align right" },
  { value: "top", label: "Align top" },
  { value: "middle", label: "Align middles vertically" },
  { value: "bottom", label: "Align bottom" },
  { value: "distribute-horizontal", label: "Distribute horizontally" },
  { value: "distribute-vertical", label: "Distribute vertically" },
];

/** Shown instead of the selection toolbar while a pen tool is active. */
export function PenOptions({
  highlight,
  color,
  onColor,
}: {
  highlight: boolean;
  color: ColorKey;
  onColor: (color: ColorKey) => void;
}) {
  return (
    <div
      className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-2 rounded-card border border-cy-gray-100 bg-white px-3 py-1.5 shadow-md"
      role="toolbar"
      aria-label={highlight ? "Highlighter options" : "Pen options"}
    >
      <span className="text-xs font-medium text-cy-gray-600">{highlight ? "Highlighter" : "Pen"}</span>
      <Swatches value={color} onChange={onColor} />
      <span className="text-xs text-cy-gray-400">Esc to finish</span>
    </div>
  );
}

export type SelectionSummary = {
  nodeCount: number;
  edgeCount: number;
  /** Whether any selected node shows text (font size applies). */
  hasText: boolean;
  /** Shared value across the selection, or null when mixed. */
  color: ColorKey | null;
  fontSize: number | null;
  shape: ShapeKind | null;
  allShapes: boolean;
  routing: EdgeRouting | null;
  arrow: EdgeArrow | null;
  dashed: boolean | null;
};

/** Floating properties bar for the current selection (nodes and/or connectors). */
export function SelectionToolbar({
  summary,
  onColor,
  onFontSize,
  onShape,
  onRouting,
  onArrow,
  onDashed,
  onFront,
  onBack,
  onDuplicate,
  onDelete,
  onAlign,
}: {
  summary: SelectionSummary;
  onAlign: (action: AlignAction) => void;
  onColor: (color: ColorKey) => void;
  onFontSize: (size: number) => void;
  onShape: (shape: ShapeKind) => void;
  onRouting: (routing: EdgeRouting) => void;
  onArrow: (arrow: EdgeArrow) => void;
  onDashed: (dashed: boolean) => void;
  onFront: () => void;
  onBack: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const hasNodes = summary.nodeCount > 0;
  const edgesOnly = !hasNodes && summary.edgeCount > 0;

  return (
    <div
      className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-2 rounded-card border border-cy-gray-100 bg-white px-2 py-1.5 shadow-md"
      role="toolbar"
      aria-label="Selection"
    >
      <Swatches value={summary.color} onChange={onColor} />
      {hasNodes && summary.hasText && (
        <>
          <Divider vertical />
          <select
            className={selectClass}
            aria-label="Font size"
            value={summary.fontSize ?? ""}
            onChange={(e) => onFontSize(Number(e.target.value))}
          >
            {summary.fontSize === null && <option value="">Size</option>}
            {FONT_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}px
              </option>
            ))}
          </select>
          {summary.allShapes && (
            <select
              className={selectClass}
              aria-label="Shape"
              value={summary.shape ?? ""}
              onChange={(e) => onShape(e.target.value as ShapeKind)}
            >
              {summary.shape === null && <option value="">Shape</option>}
              {SHAPE_KINDS.map((shape) => (
                <option key={shape} value={shape}>
                  {SHAPE_LABELS[shape]}
                </option>
              ))}
            </select>
          )}
        </>
      )}
      {edgesOnly && (
        <>
          <Divider vertical />
          <select
            className={selectClass}
            aria-label="Line style"
            value={summary.routing ?? ""}
            onChange={(e) => onRouting(e.target.value as EdgeRouting)}
          >
            {summary.routing === null && <option value="">Line</option>}
            {EDGE_ROUTINGS.map((r) => (
              <option key={r} value={r}>
                {ROUTING_LABELS[r]}
              </option>
            ))}
          </select>
          <select
            className={selectClass}
            aria-label="Arrowheads"
            value={summary.arrow ?? ""}
            onChange={(e) => onArrow(e.target.value as EdgeArrow)}
          >
            {summary.arrow === null && <option value="">Arrows</option>}
            {EDGE_ARROWS.map((a) => (
              <option key={a} value={a}>
                {ARROW_LABELS[a]}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-xs text-cy-gray-700">
            <input type="checkbox" checked={summary.dashed === true} onChange={(e) => onDashed(e.target.checked)} />
            Dashed
          </label>
        </>
      )}
      {summary.nodeCount >= 2 && (
        <>
          <Divider vertical />
          <select
            className={selectClass}
            aria-label="Align"
            value=""
            onChange={(e) => {
              if (e.target.value) onAlign(e.target.value as AlignAction);
            }}
          >
            <option value="">Align…</option>
            {ALIGN_OPTIONS.filter((o) => !o.value.startsWith("distribute") || summary.nodeCount >= 3).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </>
      )}
      <Divider vertical />
      {hasNodes && (
        <>
          <ToolButton label="Bring to front" onClick={onFront}>
            <ArrowUpToLine size={15} />
          </ToolButton>
          <ToolButton label="Send to back" onClick={onBack}>
            <ArrowDownToLine size={15} />
          </ToolButton>
          <ToolButton label="Duplicate" shortcut="Ctrl+D" onClick={onDuplicate}>
            <Copy size={15} />
          </ToolButton>
        </>
      )}
      <ToolButton label="Delete" shortcut="Del" onClick={onDelete}>
        <Trash2 size={15} />
      </ToolButton>
    </div>
  );
}
