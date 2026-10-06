"use client";

import { useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { useReactFlow } from "@xyflow/react";
import { MAX_DRAWING_POINTS, PALETTE, type ColorKey } from "@/lib/whiteboard";
import { PEN_STROKE } from "./model";

/** Screen-space distance below which a new pointer sample is dropped, to keep strokes small. */
const MIN_SAMPLE_PX = 2;

/**
 * Captures pen/highlighter strokes on a layer above the canvas. While a
 * pen tool is active this layer receives every pointer event, so it also
 * re-implements wheel pan (and Ctrl/⌘ + wheel zoom) to keep navigation
 * working mid-drawing.
 */
export function PenOverlay({
  highlight,
  color,
  onStroke,
}: {
  highlight: boolean;
  color: ColorKey;
  onStroke: (points: [number, number][]) => void;
}) {
  const { screenToFlowPosition, getViewport, setViewport, getZoom } = useReactFlow();
  const [preview, setPreview] = useState<string | null>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const stroke = useRef<{ flow: [number, number][]; screen: [number, number][] } | null>(null);

  const local = (e: PointerEvent) => {
    const rect = layerRef.current!.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top] as [number, number];
  };

  const sample = (e: PointerEvent) => {
    const s = stroke.current;
    if (!s || s.flow.length >= MAX_DRAWING_POINTS) return;
    const point = local(e);
    const last = s.screen[s.screen.length - 1];
    if (last && Math.hypot(point[0] - last[0], point[1] - last[1]) < MIN_SAMPLE_PX) return;
    const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    s.screen.push(point);
    s.flow.push([flow.x, flow.y]);
    setPreview(s.screen.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`).join(" "));
  };

  const finish = () => {
    const s = stroke.current;
    stroke.current = null;
    setPreview(null);
    if (s && s.flow.length > 0) onStroke(s.flow);
  };

  const onWheel = (e: WheelEvent) => {
    const viewport = getViewport();
    if (e.ctrlKey || e.metaKey) {
      const rect = layerRef.current!.getBoundingClientRect();
      const zoom = Math.min(4, Math.max(0.1, viewport.zoom * Math.exp(-e.deltaY * 0.01)));
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      // Keep the point under the cursor fixed while zooming.
      const scale = zoom / viewport.zoom;
      setViewport({ x: px - (px - viewport.x) * scale, y: py - (py - viewport.y) * scale, zoom });
    } else {
      setViewport({ ...viewport, x: viewport.x - e.deltaX, y: viewport.y - e.deltaY });
    }
  };

  const width = (highlight ? PEN_STROKE.highlighter : PEN_STROKE.pen) * getZoom();

  return (
    <div
      ref={layerRef}
      className="wb-pen-overlay absolute inset-0 z-[5]"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        stroke.current = { flow: [], screen: [] };
        sample(e);
      }}
      onPointerMove={(e) => {
        if (stroke.current) sample(e);
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
      onWheel={onWheel}
      aria-label={highlight ? "Highlighter canvas" : "Pen canvas"}
    >
      {preview && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full">
          <path
            d={preview}
            fill="none"
            stroke={PALETTE[color].stroke}
            strokeOpacity={highlight ? 0.4 : 1}
            strokeWidth={width}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  );
}
