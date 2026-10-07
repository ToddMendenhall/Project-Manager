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

export const NODE_KINDS = ["sticky", "shape", "text", "frame", "drawing", "image"] as const;
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
/** Per pen stroke; strokes are simplified client-side well below this. */
export const MAX_DRAWING_POINTS = 4000;
/** Images are stored as attachments; the canvas only references them. */
export const MAX_WHITEBOARD_IMAGE_BYTES = 4 * 1024 * 1024;
export const WHITEBOARD_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;
/** Thumbnails are small PNGs rendered by the editor (see the thumbnail route). */
export const MAX_WHITEBOARD_THUMBNAIL_BYTES = 400 * 1024;

const finite = z.number().finite();
const id = z.string().min(1).max(64);

/**
 * One data shape for every node kind, with kind-specific fields optional;
 * `whiteboardNodeSchema` enforces which ones each kind requires.
 * - frame: `text` is its title; contents move with it (see the editor).
 * - drawing: `points` is a pen stroke in the coordinate space of the
 *   node's original box, `pathWidth`/`pathHeight`. Rendering scales that
 *   box to the node's current size, so resizing a drawing stretches it.
 * - image: `attachmentId` is an attachments row parented by this board.
 *   Not checked on save (an admin deleting the file from the Attachments
 *   page would otherwise make the board unsaveable); the image is fetched
 *   through the org-scoped attachment route, so a board can only ever show
 *   its own org's files, and a missing one renders as a placeholder.
 */
export const whiteboardNodeDataSchema = z.object({
  text: z.string().max(10_000),
  color: z.enum(COLOR_KEYS),
  shape: z.enum(SHAPE_KINDS).optional(),
  fontSize: z.number().int().min(8).max(96).optional(),
  points: z
    .array(z.tuple([finite, finite]))
    .min(1)
    .max(MAX_DRAWING_POINTS)
    .optional(),
  pathWidth: finite.positive().max(100_000).optional(),
  pathHeight: finite.positive().max(100_000).optional(),
  strokeWidth: z.number().min(1).max(64).optional(),
  highlight: z.boolean().optional(),
  attachmentId: z.string().uuid().optional(),
});
export type WhiteboardNodeData = z.infer<typeof whiteboardNodeDataSchema>;

export const whiteboardNodeSchema = z
  .object({
    id,
    type: z.enum(NODE_KINDS),
    position: z.object({ x: finite, y: finite }),
    width: finite.positive().max(20_000),
    height: finite.positive().max(20_000),
    zIndex: z.number().int().optional(),
    data: whiteboardNodeDataSchema,
  })
  .superRefine((node, ctx) => {
    const { data } = node;
    if (node.type === "drawing" && (!data.points || !data.pathWidth || !data.pathHeight)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Drawing is missing its stroke" });
    }
    if (node.type === "image" && !data.attachmentId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Image is missing its file" });
    }
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
/** Attachment ids referenced by the board's image nodes. */
export function whiteboardImageIds(doc: WhiteboardDoc): string[] {
  return [...new Set(doc.nodes.flatMap((n) => (n.type === "image" && n.data.attachmentId ? [n.data.attachmentId] : [])))];
}

export function parseStoredWhiteboardDoc(raw: unknown): WhiteboardDoc {
  const parsed = whiteboardDocSchema.safeParse(raw);
  return parsed.success ? parsed.data : EMPTY_WHITEBOARD_DOC;
}

/**
 * Window event the editor fires after each successful save (`detail` is
 * `{ id }`), so the board list panel can show the edit without the save
 * revalidating the layout.
 */
export const WHITEBOARD_SAVED_EVENT = "whiteboard:saved";
export type WhiteboardSavedDetail = { id: string };

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
    fill: n.type === "text" || n.type === "drawing" ? "#d3d8dd" : n.type === "image" ? "#b3ddf4" : PALETTE[n.data.color].fill,
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

/**
 * Sniffs the real image type from the file's first bytes rather than
 * trusting the client-sent Content-Type, so an upload labelled image/png
 * really is one. Only raster formats: SVG is deliberately not accepted,
 * since it can carry script.
 */
export function sniffImageType(bytes: Uint8Array): (typeof WHITEBOARD_IMAGE_TYPES)[number] | null {
  const starts = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts([0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}
