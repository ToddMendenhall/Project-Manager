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

export type Tool = "select" | "hand" | "sticky" | "text" | `shape:${ShapeKind}`;

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

export const DEFAULT_FONT_SIZE: Record<NodeKind, number> = { sticky: 14, shape: 14, text: 18 };

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
export function createNode(tool: Exclude<Tool, "select" | "hand">, center: { x: number; y: number }): WbNode {
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
      data: {
        text: n.data.text,
        color: n.data.color,
        ...(n.data.shape ? { shape: n.data.shape } : {}),
        ...(n.data.fontSize ? { fontSize: n.data.fontSize } : {}),
      },
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
