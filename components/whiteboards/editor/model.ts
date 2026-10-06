import { createContext, useContext } from "react";
import type { Edge, Node } from "@xyflow/react";
import type {
  NodeKind,
  ShapeKind,
  WhiteboardDoc,
  WhiteboardEdgeData,
  WhiteboardNodeData,
} from "@/lib/whiteboard";

export type WbNode = Node<WhiteboardNodeData, NodeKind>;
export type WbEdge = Edge<WhiteboardEdgeData, "connector">;

export type Tool = "select" | "hand" | "sticky" | "text" | "frame" | "pen" | "highlighter" | `shape:${ShapeKind}`;
/** Tools that place one node with a click (pen tools draw instead). */
export type PlacementTool = "sticky" | "text" | "frame" | `shape:${ShapeKind}`;

export const isPlacementTool = (tool: Tool): tool is PlacementTool =>
  tool === "sticky" || tool === "text" || tool === "frame" || tool.startsWith("shape:");
export const isPenTool = (tool: Tool) => tool === "pen" || tool === "highlighter";

/**
 * Frames are drawn beneath every other node. Stored zIndex stays relative
 * within each layer (so "send to back" on a sticky never tucks it under a
 * frame); this offset is applied only to what React Flow renders.
 */
export const FRAME_LAYER_OFFSET = -100_000;

export const PEN_STROKE = { pen: 3, highlighter: 18 } as const;

/**
 * Per-viewer editing state the node/edge components need but which must
 * never be saved, so it's kept out of node `data` and passed by context.
 */
export type EditorContextValue = {
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  commitNodeText: (id: string, text: string) => void;
  commitEdgeLabel: (id: string, label: string) => void;
  /** Bracket a continuous gesture (resize) so it lands in undo history as one step. */
  beginInteraction: () => void;
  endInteraction: () => void;
};

export const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditor() {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error("useEditor must be used inside the whiteboard editor");
  return ctx;
}

export const DEFAULT_EDGE_DATA: WhiteboardEdgeData = {
  label: "",
  routing: "elbow",
  arrow: "end",
  color: "gray",
  dashed: false,
};

export const DEFAULT_FONT_SIZE: Record<NodeKind, number> = {
  sticky: 14,
  shape: 14,
  text: 18,
  frame: 16,
  drawing: 14,
  image: 14,
};

const SHAPE_SIZES: Record<ShapeKind, { width: number; height: number }> = {
  rectangle: { width: 160, height: 80 },
  rounded: { width: 160, height: 64 },
  ellipse: { width: 120, height: 120 },
  diamond: { width: 150, height: 110 },
  parallelogram: { width: 170, height: 80 },
};

export function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** A fresh node for a creation tool, centered on `center` (flow coordinates). */
export function createNode(tool: PlacementTool, center: { x: number; y: number }): WbNode {
  let type: NodeKind;
  let size: { width: number; height: number };
  let data: WhiteboardNodeData;
  if (tool === "sticky") {
    type = "sticky";
    size = { width: 180, height: 180 };
    data = { text: "", color: "yellow" };
  } else if (tool === "text") {
    type = "text";
    size = { width: 220, height: 44 };
    data = { text: "", color: "white" };
  } else if (tool === "frame") {
    type = "frame";
    size = { width: 640, height: 400 };
    data = { text: "Frame", color: "gray" };
  } else {
    const shape = tool.slice("shape:".length) as ShapeKind;
    type = "shape";
    size = SHAPE_SIZES[shape];
    data = { text: "", color: "white", shape };
  }
  return {
    id: newId(),
    type,
    position: { x: center.x - size.width / 2, y: center.y - size.height / 2 },
    width: size.width,
    height: size.height,
    data,
  };
}

/** Keys of node data that are saved — anything else on `data` is dropped by flowToDoc. */
const SAVED_DATA_KEYS = [
  "text",
  "color",
  "shape",
  "fontSize",
  "points",
  "pathWidth",
  "pathHeight",
  "strokeWidth",
  "highlight",
  "attachmentId",
] as const;

function pickData(data: WbNode["data"]): WbNode["data"] {
  const out: Record<string, unknown> = {};
  for (const key of SAVED_DATA_KEYS) {
    if (data[key] !== undefined) out[key] = data[key];
  }
  return out as WbNode["data"];
}

export function docToFlow(doc: WhiteboardDoc): { nodes: WbNode[]; edges: WbEdge[] } {
  return {
    nodes: doc.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      width: n.width,
      height: n.height,
      zIndex: n.zIndex,
      data: n.data,
    })),
    edges: doc.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
      targetHandle: e.targetHandle ?? null,
      type: "connector",
      data: e.data,
    })),
  };
}

/** The saved form of the canvas — drops selection, measurements and other React Flow runtime fields. */
export function flowToDoc(nodes: WbNode[], edges: WbEdge[]): WhiteboardDoc {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type ?? "sticky",
      position: { x: n.position.x, y: n.position.y },
      width: n.width ?? n.measured?.width ?? 160,
      height: n.height ?? n.measured?.height ?? 80,
      ...(n.zIndex !== undefined ? { zIndex: n.zIndex } : {}),
      data: pickData(n.data),
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: (e.sourceHandle as WhiteboardDoc["edges"][number]["sourceHandle"]) ?? null,
      targetHandle: (e.targetHandle as WhiteboardDoc["edges"][number]["targetHandle"]) ?? null,
      data: { ...DEFAULT_EDGE_DATA, ...e.data },
    })),
  };
}

/** Node box in flow coordinates (React Flow fills `measured` for nodes without explicit size). */
export function nodeRect(n: WbNode) {
  return {
    x: n.position.x,
    y: n.position.y,
    w: n.width ?? n.measured?.width ?? 0,
    h: n.height ?? n.measured?.height ?? 0,
  };
}

/**
 * Turns a pen stroke (flow coordinates) into a drawing node whose points
 * are relative to its own padded bounding box.
 */
export function createDrawingNode(
  points: [number, number][],
  options: { highlight: boolean; color: WbNode["data"]["color"] },
): WbNode {
  const strokeWidth = options.highlight ? PEN_STROKE.highlighter : PEN_STROKE.pen;
  const pad = strokeWidth;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const width = Math.max(Math.max(...xs) + pad - minX, 1);
  const height = Math.max(Math.max(...ys) + pad - minY, 1);
  const round = (v: number) => Math.round(v * 10) / 10;
  return {
    id: newId(),
    type: "drawing",
    position: { x: minX, y: minY },
    width,
    height,
    data: {
      text: "",
      color: options.color,
      points: points.map(([x, y]) => [round(x - minX), round(y - minY)]),
      pathWidth: width,
      pathHeight: height,
      strokeWidth,
      ...(options.highlight ? { highlight: true } : {}),
    },
  };
}

/** An image node at `center`, at the image's natural size capped to `maxSide`. */
export function createImageNode(
  attachmentId: string,
  center: { x: number; y: number },
  natural: { width: number; height: number },
  maxSide = 480,
): WbNode {
  const scale = Math.min(1, maxSide / Math.max(natural.width, natural.height, 1));
  const width = Math.max(Math.round(natural.width * scale), 20);
  const height = Math.max(Math.round(natural.height * scale), 20);
  return {
    id: newId(),
    type: "image",
    position: { x: center.x - width / 2, y: center.y - height / 2 },
    width,
    height,
    data: { text: "", color: "white", attachmentId },
  };
}
