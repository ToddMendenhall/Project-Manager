import { nodeRect, type WbNode } from "./model";

type Rect = { x: number; y: number; w: number; h: number };

export type Guide = { orientation: "vertical" | "horizontal"; at: number; from: number; to: number };

const xAnchors = (r: Rect) => [r.x, r.x + r.w / 2, r.x + r.w];
const yAnchors = (r: Rect) => [r.y, r.y + r.h / 2, r.y + r.h];

/**
 * Snaps a dragged node's proposed position so one of its edges or its
 * center lines up with another node's (within `threshold` flow units),
 * and returns the guide lines to draw. X and Y snap independently.
 */
export function snapToGuides(
  dragged: WbNode,
  proposed: { x: number; y: number },
  others: WbNode[],
  threshold: number,
): { position: { x: number; y: number }; guides: Guide[] } {
  const base = nodeRect(dragged);
  const rect: Rect = { ...base, x: proposed.x, y: proposed.y };
  let bestX: { delta: number; at: number; other: Rect } | null = null;
  let bestY: { delta: number; at: number; other: Rect } | null = null;

  for (const node of others) {
    if (node.id === dragged.id || node.type === "drawing") continue;
    const other = nodeRect(node);
    for (const a of xAnchors(rect)) {
      for (const b of xAnchors(other)) {
        const delta = b - a;
        if (Math.abs(delta) <= threshold && (!bestX || Math.abs(delta) < Math.abs(bestX.delta))) {
          bestX = { delta, at: b, other };
        }
      }
    }
    for (const a of yAnchors(rect)) {
      for (const b of yAnchors(other)) {
        const delta = b - a;
        if (Math.abs(delta) <= threshold && (!bestY || Math.abs(delta) < Math.abs(bestY.delta))) {
          bestY = { delta, at: b, other };
        }
      }
    }
  }

  const position = { x: rect.x + (bestX?.delta ?? 0), y: rect.y + (bestY?.delta ?? 0) };
  const snapped: Rect = { ...rect, ...position };
  const guides: Guide[] = [];
  if (bestX) {
    guides.push({
      orientation: "vertical",
      at: bestX.at,
      from: Math.min(snapped.y, bestX.other.y),
      to: Math.max(snapped.y + snapped.h, bestX.other.y + bestX.other.h),
    });
  }
  if (bestY) {
    guides.push({
      orientation: "horizontal",
      at: bestY.at,
      from: Math.min(snapped.x, bestY.other.x),
      to: Math.max(snapped.x + snapped.w, bestY.other.x + bestY.other.w),
    });
  }
  return { position, guides };
}

export type AlignAction =
  | "left"
  | "center"
  | "right"
  | "top"
  | "middle"
  | "bottom"
  | "distribute-horizontal"
  | "distribute-vertical";

/** New positions (by node id) for aligning or evenly spacing the given nodes. */
export function alignPositions(nodes: WbNode[], action: AlignAction): Map<string, { x: number; y: number }> {
  const rects = nodes.map((n) => ({ id: n.id, ...nodeRect(n) }));
  const out = new Map<string, { x: number; y: number }>();
  if (rects.length < 2) return out;

  const minX = Math.min(...rects.map((r) => r.x));
  const maxX = Math.max(...rects.map((r) => r.x + r.w));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxY = Math.max(...rects.map((r) => r.y + r.h));

  if (action === "distribute-horizontal" || action === "distribute-vertical") {
    const horizontal = action === "distribute-horizontal";
    const sorted = [...rects].sort((a, b) => (horizontal ? a.x - b.x : a.y - b.y));
    const total = sorted.reduce((sum, r) => sum + (horizontal ? r.w : r.h), 0);
    const gap = ((horizontal ? maxX - minX : maxY - minY) - total) / (sorted.length - 1);
    let cursor = horizontal ? minX : minY;
    for (const r of sorted) {
      out.set(r.id, horizontal ? { x: cursor, y: r.y } : { x: r.x, y: cursor });
      cursor += (horizontal ? r.w : r.h) + gap;
    }
    return out;
  }

  for (const r of rects) {
    const x =
      action === "left" ? minX : action === "right" ? maxX - r.w : action === "center" ? (minX + maxX) / 2 - r.w / 2 : r.x;
    const y =
      action === "top" ? minY : action === "bottom" ? maxY - r.h : action === "middle" ? (minY + maxY) / 2 - r.h / 2 : r.y;
    out.set(r.id, { x, y });
  }
  return out;
}

/** Nodes whose box lies entirely inside `frame`'s box (excluding the frame itself). */
export function nodesInsideFrame(frame: WbNode, nodes: WbNode[]): WbNode[] {
  const f = nodeRect(frame);
  return nodes.filter((n) => {
    if (n.id === frame.id) return false;
    const r = nodeRect(n);
    return r.x >= f.x && r.y >= f.y && r.x + r.w <= f.x + f.w && r.y + r.h <= f.y + f.h;
  });
}
