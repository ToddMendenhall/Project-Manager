import { z } from "zod";

/**
 * The persisted shape of a whiteboard (`whiteboards.data`). Shared by the
 * editor (which builds it from React Flow state) and the save action
 * (which validates it with `whiteboardDocSchema` before writing) — so a
 * crafted request can't store arbitrary jsonb, only what the editor would.
 *
 * Only document content lives here: selection, the viewport, and which
 * node is being edited are per-viewer UI state and are never saved.
 */

export const SHAPE_KINDS = ["rectangle", "rounded", "ellipse", "diamond", "parallelogram"] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];

/** Flowchart meaning of each shape, shown as its tooltip in the toolbar. */
export const SHAPE_LABELS: Record<ShapeKind, string> = {
  rectangle: "Process",
  rounded: "Start / End",
  ellipse: "Circle",
  diamond: "Decision",
  parallelogram: "Input / Output",
};

export const NODE_KINDS = ["sticky", "shape", "text"] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

export const COLOR_KEYS = ["yellow", "orange", "pink", "purple", "blue", "green", "gray", "white"] as const;
export type ColorKey = (typeof COLOR_KEYS)[number];

/** fill is the node background; stroke is its border (and a connector's line color). */
export const PALETTE: Record<ColorKey, { fill: string; stroke: string; label: string }> = {
  yellow: { fill: "#fff3b0", stroke: "#e0b300", label: "Yellow" },
  orange: { fill: "#ffdcb8", stroke: "#e07a10", label: "Orange" },
  pink: { fill: "#ffd3e2", stroke: "#d6457a", label: "Pink" },
  purple: { fill: "#e6dcff", stroke: "#7a52d6", label: "Purple" },
  blue: { fill: "#e2f2fb", stroke: "#0071bc", label: "Blue" },
  green: { fill: "#e0f3e7", stroke: "#009245", label: "Green" },
  gray: { fill: "#f1f3f5", stroke: "#595959", label: "Gray" },
  white: { fill: "#ffffff", stroke: "#2b2f34", label: "White" },
};

export const FONT_SIZES = [12, 14, 18, 24, 32] as const;

export const EDGE_ROUTINGS = ["curved", "elbow", "straight"] as const;
export type EdgeRouting = (typeof EDGE_ROUTINGS)[number];
export const EDGE_ARROWS = ["end", "both", "none"] as const;
export type EdgeArrow = (typeof EDGE_ARROWS)[number];

export const HANDLE_IDS = ["top", "right", "bottom", "left"] as const;

/** Caps on what one save can store — well under Postgres/Vercel limits, far above any real board. */
export const MAX_WHITEBOARD_NODES = 2000;
export const MAX_WHITEBOARD_EDGES = 4000;
export const MAX_WHITEBOARD_BYTES = 2 * 1024 * 1024;

const finite = z.number().finite();
const id = z.string().min(1).max(64);

export const whiteboardNodeDataSchema = z.object({
  text: z.string().max(10_000),
  color: z.enum(COLOR_KEYS),
  shape: z.enum(SHAPE_KINDS).optional(),
  fontSize: z.number().int().min(8).max(96).optional(),
});
export type WhiteboardNodeData = z.infer<typeof whiteboardNodeDataSchema>;

export const whiteboardNodeSchema = z.object({
  id,
  type: z.enum(NODE_KINDS),
  position: z.object({ x: finite, y: finite }),
  width: finite.positive().max(10_000),
  height: finite.positive().max(10_000),
  zIndex: z.number().int().optional(),
  data: whiteboardNodeDataSchema,
});
export type WhiteboardNode = z.infer<typeof whiteboardNodeSchema>;

export const whiteboardEdgeDataSchema = z.object({
  label: z.string().max(500),
  routing: z.enum(EDGE_ROUTINGS),
  arrow: z.enum(EDGE_ARROWS),
  color: z.enum(COLOR_KEYS),
  dashed: z.boolean(),
});
export type WhiteboardEdgeData = z.infer<typeof whiteboardEdgeDataSchema>;

const handleId = z.enum(HANDLE_IDS).nullable().optional();

export const whiteboardEdgeSchema = z.object({
  id,
  source: id,
  target: id,
  sourceHandle: handleId,
  targetHandle: handleId,
  data: whiteboardEdgeDataSchema,
});
export type WhiteboardEdge = z.infer<typeof whiteboardEdgeSchema>;

export const whiteboardDocSchema = z
  .object({
    nodes: z.array(whiteboardNodeSchema).max(MAX_WHITEBOARD_NODES),
    edges: z.array(whiteboardEdgeSchema).max(MAX_WHITEBOARD_EDGES),
  })
  .superRefine((doc, ctx) => {
    const nodeIds = new Set(doc.nodes.map((n) => n.id));
    if (nodeIds.size !== doc.nodes.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate node id" });
    }
    if (doc.edges.some((e) => !nodeIds.has(e.source) || !nodeIds.has(e.target))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Connector points at a missing node" });
    }
  });
export type WhiteboardDoc = z.infer<typeof whiteboardDocSchema>;

export const EMPTY_WHITEBOARD_DOC: WhiteboardDoc = { nodes: [], edges: [] };

/**
 * Reads a stored `data` value leniently: a row written before a schema
 * change (or by hand) loads as an empty board rather than crashing the
 * page. Saves still go through the strict schema.
 */
export function parseStoredWhiteboardDoc(raw: unknown): WhiteboardDoc {
  const parsed = whiteboardDocSchema.safeParse(raw);
  return parsed.success ? parsed.data : EMPTY_WHITEBOARD_DOC;
}

/** Only the creator or an org admin may delete a board (everyone in the org can edit it). */
export function canDeleteWhiteboard(
  board: { createdById: string | null },
  ctx: { user: { id: string }; role: "admin" | "member" },
) {
  return ctx.role === "admin" || (board.createdById !== null && board.createdById === ctx.user.id);
}

/** Rectangles for the list page's mini preview, normalized into a 0..1 box. */
export type WhiteboardPreviewRect = { x: number; y: number; w: number; h: number; fill: string; round: boolean };

export function whiteboardPreview(doc: WhiteboardDoc, limit = 150): WhiteboardPreviewRect[] {
  const nodes = doc.nodes.slice(0, limit);
  if (nodes.length === 0) return [];
  const minX = Math.min(...nodes.map((n) => n.position.x));
  const minY = Math.min(...nodes.map((n) => n.position.y));
  const maxX = Math.max(...nodes.map((n) => n.position.x + n.width));
  const maxY = Math.max(...nodes.map((n) => n.position.y + n.height));
  const span = Math.max(maxX - minX, maxY - minY, 1);
  // Center the content in the square preview box.
  const offX = (span - (maxX - minX)) / 2;
  const offY = (span - (maxY - minY)) / 2;
  return nodes.map((n) => ({
    x: (n.position.x - minX + offX) / span,
    y: (n.position.y - minY + offY) / span,
    w: n.width / span,
    h: n.height / span,
    fill: n.type === "text" ? "#d3d8dd" : PALETTE[n.data.color].fill,
    round: n.data.shape === "ellipse" || n.data.shape === "rounded",
  }));
}

export function formatRelativeTime(date: Date, now = new Date()) {
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
