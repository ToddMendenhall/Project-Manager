"use client";

import { memo, useEffect, useRef, useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  type EdgeProps,
} from "@xyflow/react";
import { PALETTE } from "@/lib/whiteboard";
import { DEFAULT_EDGE_DATA, useEditor, type WbEdge } from "./model";

const SELECTED_COLOR = "#0071bc";

function Arrowhead({ id, color }: { id: string; color: string }) {
  return (
    <marker id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
    </marker>
  );
}

/**
 * A connector between two items: curved, elbow (right-angle, the usual
 * process-map style) or straight, with optional arrowheads, dash and a
 * label. Double-click it to edit the label.
 */
export const ConnectorEdge = memo(function ConnectorEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps<WbEdge>) {
  const { editingId, setEditingId, commitEdgeLabel } = useEditor();
  const d = { ...DEFAULT_EDGE_DATA, ...data };
  const coords = { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition };
  const [path, labelX, labelY] =
    d.routing === "straight"
      ? getStraightPath(coords)
      : d.routing === "elbow"
        ? getSmoothStepPath({ ...coords, borderRadius: 8 })
        : getBezierPath(coords);

  const color = selected ? SELECTED_COLOR : PALETTE[d.color].stroke;
  // Marker ids must be unique per edge (and per color) since each edge styles its own.
  const markerId = `wb-arrow-${id}-${selected ? "sel" : d.color}`;
  const editing = editingId === id;

  return (
    <>
      <defs>
        <Arrowhead id={markerId} color={color} />
      </defs>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={d.arrow !== "none" ? `url(#${markerId})` : undefined}
        markerStart={d.arrow === "both" ? `url(#${markerId})` : undefined}
        style={{
          stroke: color,
          strokeWidth: selected ? 2.5 : 2,
          strokeDasharray: d.dashed ? "6 5" : undefined,
        }}
      />
      {(d.label || editing) && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan absolute rounded bg-white px-1.5 py-0.5 text-xs text-cy-gray-800 shadow-xs"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
              border: `1px solid ${selected ? SELECTED_COLOR : "#d3d8dd"}`,
            }}
            onDoubleClick={() => setEditingId(id)}
          >
            {editing ? (
              <LabelInput
                initial={d.label}
                onDone={(label) => {
                  commitEdgeLabel(id, label);
                  setEditingId(null);
                }}
              />
            ) : (
              <span className="whitespace-pre">{d.label}</span>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

function LabelInput({ initial, onDone }: { initial: string; onDone: (label: string) => void }) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      value={value}
      maxLength={500}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onDone(value.trim())}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
      }}
      placeholder="Label"
      aria-label="Connector label"
      className="w-28 bg-transparent text-xs outline-none"
    />
  );
}

export const edgeTypes = { connector: ConnectorEdge };
