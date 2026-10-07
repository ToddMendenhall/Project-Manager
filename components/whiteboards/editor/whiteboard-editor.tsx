"use client";

import "@xyflow/react/dist/style.css";
import "./whiteboard.css";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  ConnectionMode,
  ControlButton,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  ViewportPortal,
  addEdge,
  reconnectEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useStore,
  type Connection,
  type NodeChange,
  type OnConnect,
  type OnNodeDrag,
  type OnReconnect,
} from "@xyflow/react";
import { Download, Grid3x3 } from "lucide-react";
import {
  PALETTE,
  type ColorKey,
  type EdgeArrow,
  type EdgeRouting,
  type ShapeKind,
  type WhiteboardDoc,
  type WhiteboardEdgeData,
} from "@/lib/whiteboard";
import { buttonGhost } from "@/components/form-controls";
import { WhiteboardLinkPicker } from "@/components/whiteboards/link-picker";
import type { LinkTargetTree, WhiteboardLinkInfo } from "@/lib/whiteboard-links";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import {
  duplicateWhiteboard,
  getWhiteboardVersion,
  renameWhiteboard,
  saveWhiteboard,
} from "@/app/dashboard/whiteboards/actions";
import {
  DEFAULT_EDGE_DATA,
  DEFAULT_FONT_SIZE,
  EditorContext,
  FRAME_LAYER_OFFSET,
  createDrawingNode,
  createImageNode,
  createNode,
  docToFlow,
  flowToDoc,
  isPenTool,
  isPlacementTool,
  newId,
  type EditorContextValue,
  type PlacementTool,
  type Tool,
  type WbEdge,
  type WbNode,
} from "./model";
import { nodeTypes } from "./nodes";
import { edgeTypes } from "./connector-edge";
import { PenOptions, SelectionToolbar, ToolPalette, type SelectionSummary } from "./toolbars";
import { alignPositions, nodesInsideFrame, snapToGuides, type AlignAction, type Guide } from "./geometry";
import { PenOverlay } from "./pen-overlay";
import { dataUrlToBlob, downloadDataUrl, isSupportedImage, renderBoard, uploadWhiteboardImage } from "./media";

const AUTOSAVE_DELAY_MS = 1200;
const SAVE_RETRY_MS = 5000;
/**
 * Checking for other people's saves: every 15s while someone is using the
 * board, every 2 min once nobody has touched it for 3 min, never while the
 * tab is hidden. Each check is a function call plus a database query, and
 * a fast check on an untouched board would keep a scale-to-zero database
 * (Neon) awake for as long as the tab is left open.
 */
const VERSION_POLL_ACTIVE_MS = 15_000;
const VERSION_POLL_IDLE_MS = 120_000;
const IDLE_AFTER_MS = 180_000;
const HISTORY_LIMIT = 100;
const PASTE_OFFSET = 24;
/** Screen pixels within which a dragged node snaps to another node's edge or center. */
const GUIDE_SNAP_PX = 6;
/** Thumbnail regeneration: wait this long after a save, and no more often than the interval. */
const THUMBNAIL_DELAY_MS = 3000;
const THUMBNAIL_MIN_INTERVAL_MS = 30_000;
const NON_TEXT_KINDS = new Set(["drawing", "image"]);

type SaveStatus =
  | { kind: "saved" }
  | { kind: "unsaved" }
  | { kind: "saving" }
  | { kind: "error"; message: string }
  | { kind: "conflict"; version: number; updatedByName: string | null };

export type WhiteboardEditorProps = {
  whiteboardId: string;
  name: string;
  initialDoc: WhiteboardDoc;
  initialVersion: number;
  /** False for boards saved before thumbnails existed, so the editor makes one on open. */
  hasThumbnail: boolean;
  /** The board's optional Project/Program link, and the choices for changing it. */
  link: WhiteboardLinkInfo | null;
  linkTargets: LinkTargetTree;
  onDelete?: () => Promise<void>;
};

export function WhiteboardEditor(props: WhiteboardEditorProps) {
  return (
    <ReactFlowProvider>
      <Editor {...props} />
    </ReactFlowProvider>
  );
}

const serialize = (nodes: WbNode[], edges: WbEdge[]) => JSON.stringify(flowToDoc(nodes, edges));

const isTypingTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);

function Editor({
  whiteboardId,
  name: initialName,
  initialDoc,
  initialVersion,
  hasThumbnail,
  link,
  linkTargets,
  onDelete,
}: WhiteboardEditorProps) {
  const initialFlow = useMemo(() => docToFlow(initialDoc), [initialDoc]);
  const [nodes, setNodes, onNodesChange] = useNodesState<WbNode>(initialFlow.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<WbEdge>(initialFlow.edges);
  const { screenToFlowPosition, deleteElements, getZoom } = useReactFlow<WbNode, WbEdge>();
  const connecting = useStore((s) => s.connection.inProgress);
  const canvasRef = useRef<HTMLDivElement>(null);

  const [tool, setTool] = useState<Tool>("select");
  const [snap, setSnap] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [penColor, setPenColor] = useState<{ pen: ColorKey; highlighter: ColorKey }>({
    pen: "white",
    highlighter: "yellow",
  });
  const [guides, setGuides] = useState<Guide[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  // Latest state for handlers registered once (keyboard, unmount flush).
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  // ---- Undo history --------------------------------------------------------
  // Snapshots are serialized docs. `committed` is the latest settled state;
  // any settled change pushes the previous one onto `past`. Mid-gesture
  // states (dragging, resizing) are skipped so one drag = one undo step.
  // Same serialization as every later snapshot, so opening a board never
  // looks like an edit.
  const initialSerialized = useMemo(() => serialize(initialFlow.nodes, initialFlow.edges), [initialFlow]);
  const committedRef = useRef(initialSerialized);
  const pastRef = useRef<string[]>([]);
  const futureRef = useRef<string[]>([]);
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
  const interactionsRef = useRef(0);
  const [interactionTick, setInteractionTick] = useState(0);

  const syncHistoryState = () =>
    setHistoryState({ canUndo: pastRef.current.length > 0, canRedo: futureRef.current.length > 0 });

  // ---- Autosave ------------------------------------------------------------
  const [status, setStatus] = useState<SaveStatus>({ kind: "saved" });
  const statusRef = useRef(status);
  statusRef.current = status;
  const savedRef = useRef(initialSerialized);
  const versionRef = useRef(initialVersion);
  const savingRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedRef = useRef(false);
  const [remoteUpdate, setRemoteUpdate] = useState<{ updatedByName: string | null } | null>(null);

  // Set further down (it needs the canvas); called after each successful save.
  const scheduleThumbnailRef = useRef<() => void>(() => {});

  const flush = useCallback(async (): Promise<void> => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (closedRef.current || savingRef.current || statusRef.current.kind === "conflict") return;
    const snapshot = committedRef.current;
    if (snapshot === savedRef.current) {
      setStatus({ kind: "saved" });
      return;
    }

    savingRef.current = true;
    setStatus({ kind: "saving" });
    try {
      const result = await saveWhiteboard(whiteboardId, JSON.parse(snapshot), versionRef.current);
      if (result.ok) {
        versionRef.current = result.version;
        savedRef.current = snapshot;
        setRemoteUpdate(null);
        scheduleThumbnailRef.current();
        if (committedRef.current === snapshot) {
          setStatus({ kind: "saved" });
        } else {
          // More edits landed while this save was in flight.
          setStatus({ kind: "unsaved" });
          saveTimerRef.current = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
        }
      } else if (result.reason === "conflict") {
        setStatus({ kind: "conflict", version: result.version, updatedByName: result.updatedByName });
      } else {
        setStatus({ kind: "error", message: result.message });
      }
    } catch {
      setStatus({ kind: "error", message: "Couldn't save — retrying…" });
      saveTimerRef.current = setTimeout(() => void flush(), SAVE_RETRY_MS);
    } finally {
      savingRef.current = false;
    }
  }, [whiteboardId]);

  const scheduleSave = useCallback(() => {
    if (statusRef.current.kind === "conflict") return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (committedRef.current === savedRef.current) {
      if (!savingRef.current) setStatus({ kind: "saved" });
      return;
    }
    if (!savingRef.current) setStatus({ kind: "unsaved" });
    saveTimerRef.current = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
  }, [flush]);

  // Record settled changes into history and queue an autosave.
  useEffect(() => {
    if (interactionsRef.current > 0 || nodes.some((n) => n.dragging)) return;
    const serialized = serialize(nodes, edges);
    if (serialized === committedRef.current) return;
    pastRef.current.push(committedRef.current);
    if (pastRef.current.length > HISTORY_LIMIT) pastRef.current.shift();
    futureRef.current = [];
    committedRef.current = serialized;
    syncHistoryState();
    scheduleSave();
  }, [nodes, edges, interactionTick, scheduleSave]);

  const applySnapshot = useCallback(
    (serialized: string) => {
      const flow = docToFlow(JSON.parse(serialized) as WhiteboardDoc);
      committedRef.current = serialized;
      setNodes(flow.nodes);
      setEdges(flow.edges);
      setEditingId(null);
      syncHistoryState();
      scheduleSave();
    },
    [setNodes, setEdges, scheduleSave],
  );

  const undo = useCallback(() => {
    const previous = pastRef.current.pop();
    if (previous === undefined) return;
    futureRef.current.push(committedRef.current);
    applySnapshot(previous);
  }, [applySnapshot]);

  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (next === undefined) return;
    pastRef.current.push(committedRef.current);
    applySnapshot(next);
  }, [applySnapshot]);

  // Warn before closing the tab with unsaved work; save on in-app navigation away.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!closedRef.current && committedRef.current !== savedRef.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (
        !closedRef.current &&
        !savingRef.current &&
        statusRef.current.kind !== "conflict" &&
        committedRef.current !== savedRef.current
      ) {
        void saveWhiteboard(whiteboardId, JSON.parse(committedRef.current), versionRef.current).catch(() => {});
      }
    };
  }, [whiteboardId]);

  // Notice someone else's save while this board is open (see VERSION_POLL_*).
  useEffect(() => {
    let lastActivity = Date.now();
    let lastCheck = Date.now();

    const check = async () => {
      if (document.visibilityState !== "visible" || savingRef.current || closedRef.current) return;
      if (statusRef.current.kind === "conflict") return;
      lastCheck = Date.now();
      try {
        const remote = await getWhiteboardVersion(whiteboardId);
        if (remote && remote.version > versionRef.current) {
          setRemoteUpdate({ updatedByName: remote.updatedByName });
        }
      } catch {
        // Transient network error — try again next tick.
      }
    };

    const timer = setInterval(() => {
      const idle = Date.now() - lastActivity > IDLE_AFTER_MS;
      if (Date.now() - lastCheck >= (idle ? VERSION_POLL_IDLE_MS : VERSION_POLL_ACTIVE_MS)) void check();
    }, VERSION_POLL_ACTIVE_MS);

    const onActivity = () => {
      lastActivity = Date.now();
    };
    // Coming back to the tab: catch up right away rather than waiting out an idle interval.
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        lastActivity = Date.now();
        void check();
      }
    };
    const activityEvents = ["pointerdown", "keydown", "wheel"] as const;
    activityEvents.forEach((type) => window.addEventListener(type, onActivity, { passive: true }));
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      activityEvents.forEach((type) => window.removeEventListener(type, onActivity));
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [whiteboardId]);

  function reloadLatest() {
    closedRef.current = true;
    window.location.reload();
  }

  function keepMine() {
    if (status.kind !== "conflict") return;
    versionRef.current = status.version;
    statusRef.current = { kind: "unsaved" };
    setStatus({ kind: "unsaved" });
    setRemoteUpdate(null);
    void flush();
  }

  // ---- Editing helpers -----------------------------------------------------
  const editorContext = useMemo<EditorContextValue>(
    () => ({
      editingId,
      setEditingId,
      commitNodeText: (id, text) =>
        setNodes((ns) => ns.map((n) => (n.id === id && n.data.text !== text ? { ...n, data: { ...n.data, text } } : n))),
      commitEdgeLabel: (id, label) =>
        setEdges((es) =>
          es.map((e) =>
            e.id === id && e.data?.label !== label
              ? { ...e, data: { ...DEFAULT_EDGE_DATA, ...e.data, label } }
              : e,
          ),
        ),
      beginInteraction: () => {
        interactionsRef.current += 1;
      },
      endInteraction: () => {
        interactionsRef.current = Math.max(0, interactionsRef.current - 1);
        setInteractionTick((t) => t + 1);
      },
    }),
    [editingId, setNodes, setEdges],
  );

  const addNodeAt = useCallback(
    (creator: PlacementTool, clientX: number, clientY: number) => {
      const node = createNode(creator, screenToFlowPosition({ x: clientX, y: clientY }));
      setNodes((ns) => [...ns.map((n) => (n.selected ? { ...n, selected: false } : n)), { ...node, selected: true }]);
      setEdges((es) => es.map((e) => (e.selected ? { ...e, selected: false } : e)));
      setEditingId(node.id);
      setTool("select");
    },
    [screenToFlowPosition, setNodes, setEdges],
  );

  const onPaneClick = useCallback(
    (event: MouseEvent) => {
      if (isPlacementTool(tool)) addNodeAt(tool, event.clientX, event.clientY);
    },
    [tool, addNodeAt],
  );

  // Clicking inside a frame (rather than empty canvas) places there too.
  const onNodeClick = useCallback(
    (event: MouseEvent, node: WbNode) => {
      if (node.type === "frame" && isPlacementTool(tool)) addNodeAt(tool, event.clientX, event.clientY);
    },
    [tool, addNodeAt],
  );

  // Double-click edits a node's text; on a frame's body (not its title) it drops a sticky instead.
  const onNodeDoubleClick = useCallback(
    (event: MouseEvent, node: WbNode) => {
      if (node.type === "drawing" || node.type === "image") return;
      if (node.type === "frame" && !(event.target as Element).closest?.(".wb-frame-title")) {
        addNodeAt("sticky", event.clientX, event.clientY);
        return;
      }
      setEditingId(node.id);
    },
    [addNodeAt],
  );

  // ---- Frames carry their contents ----------------------------------------
  // When a drag includes a frame, every unselected node fully inside it at
  // drag start moves by the same delta. (Selected nodes are already being
  // moved by React Flow.)
  const frameDragRef = useRef<{
    frameId: string;
    start: { x: number; y: number };
    carried: Map<string, { x: number; y: number }>;
  } | null>(null);

  const onNodeDragStart: OnNodeDrag<WbNode> = useCallback((_event, _node, dragged) => {
    const frame = dragged.find((n) => n.type === "frame");
    if (!frame) {
      frameDragRef.current = null;
      return;
    }
    const draggedIds = new Set(dragged.map((n) => n.id));
    const carried = new Map<string, { x: number; y: number }>();
    for (const f of dragged.filter((n) => n.type === "frame")) {
      for (const inside of nodesInsideFrame(f, nodesRef.current)) {
        if (!draggedIds.has(inside.id)) carried.set(inside.id, { ...inside.position });
      }
    }
    frameDragRef.current = { frameId: frame.id, start: { ...frame.position }, carried };
  }, []);

  const onNodeDrag: OnNodeDrag<WbNode> = useCallback(
    (_event, _node, dragged) => {
      const drag = frameDragRef.current;
      if (!drag || drag.carried.size === 0) return;
      const frame = dragged.find((n) => n.id === drag.frameId);
      if (!frame) return;
      const dx = frame.position.x - drag.start.x;
      const dy = frame.position.y - drag.start.y;
      setNodes((ns) =>
        ns.map((n) => {
          const origin = drag.carried.get(n.id);
          return origin ? { ...n, position: { x: origin.x + dx, y: origin.y + dy } } : n;
        }),
      );
    },
    [setNodes],
  );

  const onNodeDragStop: OnNodeDrag<WbNode> = useCallback(() => {
    frameDragRef.current = null;
    setGuides([]);
  }, []);

  // ---- Alignment guides ----------------------------------------------------
  // While a single node is dragged, snap it to other nodes' edges/centers.
  const handleNodesChange = useCallback(
    (changes: NodeChange<WbNode>[]) => {
      const [first] = changes;
      if (changes.length === 1 && first.type === "position" && first.dragging && first.position) {
        const node = nodesRef.current.find((n) => n.id === first.id);
        if (node && node.type !== "drawing") {
          const snapped = snapToGuides(node, first.position, nodesRef.current, GUIDE_SNAP_PX / getZoom());
          first.position = snapped.position;
          setGuides(snapped.guides);
        }
      } else if (changes.some((c) => c.type === "position" && !c.dragging)) {
        setGuides([]);
      }
      onNodesChange(changes);
    },
    [onNodesChange, getZoom],
  );

  // Frames render beneath everything else; stored zIndex stays layer-relative.
  const renderedNodes = useMemo(
    () => nodes.map((n) => (n.type === "frame" ? { ...n, zIndex: (n.zIndex ?? 0) + FRAME_LAYER_OFFSET } : n)),
    [nodes],
  );

  // ---- Pen strokes ---------------------------------------------------------
  const onStroke = useCallback(
    (points: [number, number][]) => {
      const highlight = tool === "highlighter";
      const node = createDrawingNode(points, { highlight, color: highlight ? penColor.highlighter : penColor.pen });
      setNodes((ns) => [...ns, node]);
    },
    [tool, penColor, setNodes],
  );

  // ---- Images --------------------------------------------------------------
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);

  const addImages = useCallback(
    async (files: File[], at?: { clientX: number; clientY: number }) => {
      const images = files.filter(isSupportedImage);
      if (images.length === 0) {
        if (files.length > 0) setNotice("Only PNG, JPEG, GIF and WebP images can be added.");
        return;
      }
      const rect = canvasRef.current?.getBoundingClientRect();
      const base = screenToFlowPosition(
        at ? { x: at.clientX, y: at.clientY } : { x: (rect?.left ?? 0) + (rect?.width ?? 0) / 2, y: (rect?.top ?? 0) + (rect?.height ?? 0) / 2 },
      );
      setUploading((n) => n + images.length);
      await Promise.all(
        images.map(async (file, i) => {
          try {
            const { attachmentId, natural } = await uploadWhiteboardImage(whiteboardId, file);
            const node = createImageNode(attachmentId, { x: base.x + i * 40, y: base.y + i * 40 }, natural);
            setNodes((ns) => [...ns.map((n) => (n.selected ? { ...n, selected: false } : n)), { ...node, selected: true }]);
          } catch (err) {
            setNotice(err instanceof Error ? err.message : "Upload failed.");
          } finally {
            setUploading((n) => n - 1);
          }
        }),
      );
    },
    [screenToFlowPosition, setNodes, whiteboardId],
  );

  // Paste an image from the clipboard (screenshots etc.).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const files = Array.from(e.clipboardData?.files ?? []).filter(isSupportedImage);
      if (files.length > 0) {
        e.preventDefault();
        void addImages(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addImages]);

  // ---- Export and thumbnails -----------------------------------------------
  const [exporting, setExporting] = useState(false);

  const exportBoard = useCallback(
    async (format: "png" | "svg") => {
      const container = canvasRef.current;
      if (!container || nodesRef.current.length === 0) {
        setNotice("Add something to the whiteboard before exporting.");
        return;
      }
      setExporting(true);
      // Clear selection so outlines and resize handles don't end up in the image.
      setNodes((ns) => ns.map((n) => (n.selected ? { ...n, selected: false } : n)));
      setEdges((es) => es.map((e) => (e.selected ? { ...e, selected: false } : e)));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      try {
        const dataUrl = await renderBoard(container, nodesRef.current, { format, maxWidth: 4000, maxHeight: 4000 });
        if (dataUrl) {
          const safeName = (nameRef.current || "whiteboard").replace(/[^\w\- ]+/g, "").trim() || "whiteboard";
          downloadDataUrl(dataUrl, `${safeName}.${format}`);
        }
      } catch {
        setNotice("Couldn't export this whiteboard.");
      } finally {
        setExporting(false);
      }
    },
    [setNodes, setEdges],
  );

  const nameRef = useRef(initialName);
  const thumbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastThumbRef = useRef<{ at: number; doc: string }>({ at: 0, doc: hasThumbnail ? initialSerialized : "" });

  const makeThumbnail = useCallback(async () => {
    thumbTimerRef.current = null;
    const container = canvasRef.current;
    const doc = savedRef.current;
    if (!container || closedRef.current || doc === lastThumbRef.current.doc) return;
    const wait = lastThumbRef.current.at + THUMBNAIL_MIN_INTERVAL_MS - Date.now();
    if (wait > 0) {
      thumbTimerRef.current = setTimeout(() => void makeThumbnail(), wait);
      return;
    }
    lastThumbRef.current = { at: Date.now(), doc };
    try {
      const dataUrl = await renderBoard(container, nodesRef.current, {
        format: "png",
        maxWidth: 480,
        maxHeight: 300,
        pixelRatio: 1,
      });
      if (!dataUrl) return;
      await fetch(`/api/whiteboards/${whiteboardId}/thumbnail`, {
        method: "POST",
        headers: { "Content-Type": "image/png" },
        body: await dataUrlToBlob(dataUrl),
      });
    } catch {
      // A missing thumbnail only affects the list page's preview.
    }
  }, [whiteboardId]);

  scheduleThumbnailRef.current = () => {
    if (thumbTimerRef.current) clearTimeout(thumbTimerRef.current);
    thumbTimerRef.current = setTimeout(() => void makeThumbnail(), THUMBNAIL_DELAY_MS);
  };

  // Boards from before thumbnails existed get one shortly after opening.
  useEffect(() => {
    if (!hasThumbnail && initialFlow.nodes.length > 0) scheduleThumbnailRef.current();
    return () => {
      if (thumbTimerRef.current) clearTimeout(thumbTimerRef.current);
    };
  }, [hasThumbnail, initialFlow]);

  // Double-clicking empty canvas drops a sticky note, as in ClickUp/FigJam.
  const onCanvasDoubleClick = useCallback(
    (event: MouseEvent) => {
      if ((event.target as Element).classList?.contains("react-flow__pane")) {
        addNodeAt("sticky", event.clientX, event.clientY);
      }
    },
    [addNodeAt],
  );

  const onConnect: OnConnect = useCallback(
    (connection: Connection) =>
      setEdges((es) => addEdge({ ...connection, id: newId(), type: "connector", data: { ...DEFAULT_EDGE_DATA } }, es)),
    [setEdges],
  );

  const onReconnect: OnReconnect<WbEdge> = useCallback(
    (oldEdge, connection) => setEdges((es) => reconnectEdge(oldEdge, connection, es, { shouldReplaceId: false })),
    [setEdges],
  );

  // ---- Selection actions ---------------------------------------------------
  const selectedNodes = nodes.filter((n) => n.selected);
  const selectedEdges = edges.filter((e) => e.selected);

  const updateSelectedNodes = useCallback(
    (fn: (n: WbNode) => WbNode) => setNodes((ns) => ns.map((n) => (n.selected ? fn(n) : n))),
    [setNodes],
  );
  const updateSelectedEdges = useCallback(
    (patch: Partial<WhiteboardEdgeData>) =>
      setEdges((es) =>
        es.map((e) => (e.selected ? { ...e, data: { ...DEFAULT_EDGE_DATA, ...e.data, ...patch } } : e)),
      ),
    [setEdges],
  );

  const clipboardRef = useRef<{ nodes: WbNode[]; edges: WbEdge[]; pasteCount: number } | null>(null);

  const copySelection = useCallback(() => {
    const picked = nodesRef.current.filter((n) => n.selected);
    if (picked.length === 0) return false;
    const ids = new Set(picked.map((n) => n.id));
    clipboardRef.current = {
      nodes: picked,
      edges: edgesRef.current.filter((e) => ids.has(e.source) && ids.has(e.target)),
      pasteCount: 0,
    };
    return true;
  }, []);

  const paste = useCallback(() => {
    const clip = clipboardRef.current;
    if (!clip) return;
    clip.pasteCount += 1;
    const offset = PASTE_OFFSET * clip.pasteCount;
    const idMap = new Map(clip.nodes.map((n) => [n.id, newId()]));
    const pastedNodes: WbNode[] = clip.nodes.map((n) => ({
      id: idMap.get(n.id)!,
      type: n.type,
      position: { x: n.position.x + offset, y: n.position.y + offset },
      width: n.width,
      height: n.height,
      zIndex: n.zIndex,
      data: { ...n.data },
      selected: true,
    }));
    const pastedEdges: WbEdge[] = clip.edges.map((e) => ({
      id: newId(),
      type: "connector",
      source: idMap.get(e.source)!,
      target: idMap.get(e.target)!,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      data: { ...DEFAULT_EDGE_DATA, ...e.data },
    }));
    setNodes((ns) => [...ns.map((n) => (n.selected ? { ...n, selected: false } : n)), ...pastedNodes]);
    setEdges((es) => [...es.map((e) => (e.selected ? { ...e, selected: false } : e)), ...pastedEdges]);
  }, [setNodes, setEdges]);

  const duplicateSelection = useCallback(() => {
    if (copySelection()) paste();
  }, [copySelection, paste]);

  const deleteSelection = useCallback(() => {
    void deleteElements({
      nodes: nodesRef.current.filter((n) => n.selected),
      edges: edgesRef.current.filter((e) => e.selected),
    });
  }, [deleteElements]);

  const reorderSelection = useCallback(
    (direction: "front" | "back") => {
      // Within each layer: frames reorder among frames, everything else among the rest.
      setNodes((ns) => {
        const target = (frames: boolean) => {
          const zs = ns.filter((n) => (n.type === "frame") === frames).map((n) => n.zIndex ?? 0);
          return direction === "front" ? Math.max(...zs) + 1 : Math.min(...zs) - 1;
        };
        const frameZ = target(true);
        const otherZ = target(false);
        return ns.map((n) => (n.selected ? { ...n, zIndex: n.type === "frame" ? frameZ : otherZ } : n));
      });
    },
    [setNodes],
  );

  const alignSelection = useCallback(
    (action: AlignAction) => {
      const positions = alignPositions(
        nodesRef.current.filter((n) => n.selected),
        action,
      );
      setNodes((ns) => ns.map((n) => (positions.has(n.id) ? { ...n, position: positions.get(n.id)! } : n)));
    },
    [setNodes],
  );

  // ---- Keyboard shortcuts --------------------------------------------------
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && key === "y") {
        e.preventDefault();
        redo();
      } else if (mod && key === "c") {
        copySelection();
      } else if (mod && key === "v") {
        if (clipboardRef.current) {
          e.preventDefault();
          paste();
        }
      } else if (mod && key === "d") {
        e.preventDefault();
        duplicateSelection();
      } else if (mod && key === "a") {
        e.preventDefault();
        setNodes((ns) => ns.map((n) => ({ ...n, selected: true })));
        setEdges((es) => es.map((ed) => ({ ...ed, selected: true })));
      } else if (!mod && !e.altKey) {
        if (key === "escape") {
          setTool("select");
          setNodes((ns) => ns.map((n) => (n.selected ? { ...n, selected: false } : n)));
          setEdges((es) => es.map((ed) => (ed.selected ? { ...ed, selected: false } : ed)));
        } else if (key === "enter") {
          const picked = nodesRef.current.filter((n) => n.selected);
          if (picked.length === 1) {
            e.preventDefault();
            setEditingId(picked[0].id);
          }
        } else {
          const toolKeys: Record<string, Tool> = {
            v: "select",
            h: "hand",
            s: "sticky",
            t: "text",
            r: "shape:rectangle",
            o: "shape:ellipse",
            d: "shape:diamond",
            f: "frame",
            p: "pen",
            m: "highlighter",
          };
          if (toolKeys[key]) setTool(toolKeys[key]);
          else if (key === "i") fileInputRef.current?.click();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo, copySelection, paste, duplicateSelection, setNodes, setEdges]);

  // ---- Selection summary (shared values, or null when mixed) ---------------
  const summary = useMemo<SelectionSummary | null>(() => {
    if (selectedNodes.length === 0 && selectedEdges.length === 0) return null;
    const shared = <T,>(values: T[]): T | null => (values.length > 0 && values.every((v) => v === values[0]) ? values[0] : null);
    const edgeData = selectedEdges.map((e) => ({ ...DEFAULT_EDGE_DATA, ...e.data }));
    const colors = selectedNodes.length > 0 ? selectedNodes.map((n) => n.data.color) : edgeData.map((d) => d.color);
    return {
      nodeCount: selectedNodes.length,
      edgeCount: selectedEdges.length,
      color: shared(colors),
      hasText: selectedNodes.some((n) => !NON_TEXT_KINDS.has(n.type ?? "")),
      fontSize: shared(
        selectedNodes
          .filter((n) => !NON_TEXT_KINDS.has(n.type ?? ""))
          .map((n) => n.data.fontSize ?? DEFAULT_FONT_SIZE[n.type ?? "sticky"]),
      ),
      shape: shared(selectedNodes.map((n) => n.data.shape ?? null)),
      allShapes: selectedNodes.length > 0 && selectedNodes.every((n) => n.type === "shape"),
      routing: shared(edgeData.map((d) => d.routing)),
      arrow: shared(edgeData.map((d) => d.arrow)),
      dashed: shared(edgeData.map((d) => d.dashed)),
    };
  }, [selectedNodes, selectedEdges]);

  const placing = isPlacementTool(tool);
  const drawing = isPenTool(tool);

  return (
    <div className="flex h-full flex-col">
      <EditorHeader
        whiteboardId={whiteboardId}
        link={link}
        linkTargets={linkTargets}
        initialName={initialName}
        status={status}
        flush={flush}
        onRenamed={(name) => {
          nameRef.current = name;
        }}
        exporting={exporting}
        onExport={exportBoard}
        onDelete={
          onDelete &&
          (async () => {
            closedRef.current = true;
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
            try {
              await onDelete();
            } catch (err) {
              closedRef.current = false;
              throw err;
            }
          })
        }
      />
      <div
        ref={canvasRef}
        className={`wb-canvas relative min-h-0 flex-1 ${placing ? "wb-placing" : ""} ${connecting ? "wb-connecting" : ""}`}
        onDragOver={(e) => {
          if (Array.from(e.dataTransfer.types).includes("Files")) e.preventDefault();
        }}
        onDrop={(e) => {
          const files = Array.from(e.dataTransfer.files);
          if (files.length === 0) return;
          e.preventDefault();
          void addImages(files, { clientX: e.clientX, clientY: e.clientY });
        }}
      >
        <EditorContext.Provider value={editorContext}>
          <ReactFlow<WbNode, WbEdge>
            nodes={renderedNodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onReconnect={onReconnect}
            onPaneClick={onPaneClick}
            onDoubleClick={onCanvasDoubleClick}
            onNodeClick={onNodeClick}
            onNodeDoubleClick={onNodeDoubleClick}
            onNodeDragStart={onNodeDragStart}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            elevateNodesOnSelect={false}
            onEdgeDoubleClick={(_, edge) => setEditingId(edge.id)}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            isValidConnection={(c) => c.source !== c.target}
            connectionMode={ConnectionMode.Loose}
            connectionLineType={ConnectionLineType.SmoothStep}
            connectionLineStyle={{ stroke: "#0071bc", strokeWidth: 2 }}
            connectionRadius={30}
            edgesReconnectable
            deleteKeyCode={["Backspace", "Delete"]}
            multiSelectionKeyCode={["Meta", "Control", "Shift"]}
            selectionOnDrag={tool === "select"}
            selectionMode={SelectionMode.Partial}
            panOnDrag={tool === "hand" ? true : [1]}
            panOnScroll
            zoomOnDoubleClick={false}
            snapToGrid={snap}
            snapGrid={[10, 10]}
            minZoom={0.1}
            maxZoom={4}
            fitView={initialFlow.nodes.length > 0}
            fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
            attributionPosition="bottom-center"
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="#c4cad1" />
            <GuideLines guides={guides} />
            <Controls position="bottom-left" showInteractive={false}>
              <ControlButton
                onClick={() => setSnap((s) => !s)}
                title={snap ? "Snap to grid: on" : "Snap to grid: off"}
                aria-label="Toggle snap to grid"
                aria-pressed={snap}
                style={snap ? { color: "#0071bc" } : undefined}
              >
                <Grid3x3 size={14} />
              </ControlButton>
            </Controls>
            <MiniMap
              position="bottom-right"
              pannable
              zoomable
              nodeColor={(n) =>
                n.type === "text" || n.type === "drawing" || n.type === "image"
                  ? "#d3d8dd"
                  : PALETTE[(n.data as WbNode["data"]).color].fill
              }
              nodeStrokeColor={(n) => PALETTE[(n.data as WbNode["data"]).color].stroke}
              nodeStrokeWidth={2}
            />
          </ReactFlow>
        </EditorContext.Provider>

        {drawing && (
          <PenOverlay
            highlight={tool === "highlighter"}
            color={tool === "highlighter" ? penColor.highlighter : penColor.pen}
            onStroke={onStroke}
          />
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          className="hidden"
          aria-hidden
          tabIndex={-1}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            void addImages(files);
          }}
        />

        <ToolPalette
          tool={tool}
          onTool={setTool}
          onImage={() => fileInputRef.current?.click()}
          imageBusy={uploading > 0}
          canUndo={historyState.canUndo}
          canRedo={historyState.canRedo}
          onUndo={undo}
          onRedo={redo}
        />

        {drawing && (
          <PenOptions
            highlight={tool === "highlighter"}
            color={tool === "highlighter" ? penColor.highlighter : penColor.pen}
            onColor={(color) =>
              setPenColor((c) => (tool === "highlighter" ? { ...c, highlighter: color } : { ...c, pen: color }))
            }
          />
        )}

        {!drawing && summary && editingId === null && (
          <SelectionToolbar
            summary={summary}
            onAlign={alignSelection}
            onColor={(color: ColorKey) => {
              updateSelectedNodes((n) => ({ ...n, data: { ...n.data, color } }));
              updateSelectedEdges({ color });
            }}
            onFontSize={(fontSize) => updateSelectedNodes((n) => ({ ...n, data: { ...n.data, fontSize } }))}
            onShape={(shape: ShapeKind) =>
              updateSelectedNodes((n) => (n.type === "shape" ? { ...n, data: { ...n.data, shape } } : n))
            }
            onRouting={(routing: EdgeRouting) => updateSelectedEdges({ routing })}
            onArrow={(arrow: EdgeArrow) => updateSelectedEdges({ arrow })}
            onDashed={(dashed) => updateSelectedEdges({ dashed })}
            onFront={() => reorderSelection("front")}
            onBack={() => reorderSelection("back")}
            onDuplicate={duplicateSelection}
            onDelete={deleteSelection}
          />
        )}

        {nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="max-w-sm text-center">
              <p className="text-sm font-medium text-cy-gray-700">This whiteboard is empty</p>
              <p className="mt-1 text-sm text-cy-gray-500">
                Double-click anywhere to add a sticky note, or pick a shape on the left. Drag from the dot on an
                item&rsquo;s edge to connect it to another.
              </p>
            </div>
          </div>
        )}

        {notice && (
          <div
            role="alert"
            className="absolute bottom-16 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-card border border-cy-red-300 bg-cy-red-100 px-4 py-2 text-sm text-cy-red-600 shadow-md"
          >
            {notice}
            <button type="button" onClick={() => setNotice(null)} className="font-semibold underline">
              Dismiss
            </button>
          </div>
        )}

        {status.kind === "conflict" ? (
          <Banner tone="warning">
            {status.updatedByName ?? "Someone else"} saved changes to this whiteboard while you were editing.
            <button type="button" onClick={reloadLatest} className="font-semibold underline">
              Load their version
            </button>
            <button type="button" onClick={keepMine} className="font-semibold underline">
              Overwrite with mine
            </button>
          </Banner>
        ) : (
          remoteUpdate && (
            <Banner tone="info">
              {remoteUpdate.updatedByName ?? "Someone else"} updated this whiteboard.
              <button type="button" onClick={reloadLatest} className="font-semibold underline">
                Reload
              </button>
            </Banner>
          )
        )}
      </div>
    </div>
  );
}

/** Alignment guides, drawn in flow coordinates inside the viewport transform. */
function GuideLines({ guides }: { guides: Guide[] }) {
  const zoom = useStore((s) => s.transform[2]);
  if (guides.length === 0) return null;
  const thickness = 1 / zoom;
  return (
    <ViewportPortal>
      {guides.map((g, i) => (
        <div
          key={i}
          className="pointer-events-none absolute bg-cy-red-500"
          style={
            g.orientation === "vertical"
              ? { left: g.at - thickness / 2, top: g.from, width: thickness, height: g.to - g.from }
              : { top: g.at - thickness / 2, left: g.from, height: thickness, width: g.to - g.from }
          }
        />
      ))}
    </ViewportPortal>
  );
}

function Banner({ tone, children }: { tone: "warning" | "info"; children: ReactNode }) {
  return (
    <div
      role="status"
      className={`absolute left-1/2 top-16 z-20 flex -translate-x-1/2 items-center gap-3 rounded-card border px-4 py-2 text-sm shadow-md ${
        tone === "warning"
          ? "border-cy-amber-400 bg-cy-amber-100 text-cy-amber-600"
          : "border-cy-blue-200 bg-cy-blue-100 text-cy-blue-800"
      }`}
    >
      {children}
    </div>
  );
}

const STATUS_TEXT: Record<Exclude<SaveStatus["kind"], "error">, string> = {
  saved: "All changes saved",
  unsaved: "Unsaved changes",
  saving: "Saving…",
  conflict: "Not saved — conflict",
};

function EditorHeader({
  whiteboardId,
  link,
  linkTargets,
  initialName,
  status,
  flush,
  onRenamed,
  exporting,
  onExport,
  onDelete,
}: {
  whiteboardId: string;
  link: WhiteboardLinkInfo | null;
  linkTargets: LinkTargetTree;
  initialName: string;
  status: SaveStatus;
  flush: () => Promise<void>;
  onRenamed: (name: string) => void;
  exporting: boolean;
  onExport: (format: "png" | "svg") => void;
  onDelete?: () => Promise<void>;
}) {
  const [exportOpen, setExportOpen] = useState(false);
  const [name, setName] = useState(initialName);
  const savedNameRef = useRef(initialName);
  const [isDuplicating, startDuplicate] = useTransition();
  const [, startRename] = useTransition();

  function commitName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === savedNameRef.current) {
      setName(savedNameRef.current);
      return;
    }
    const previous = savedNameRef.current;
    savedNameRef.current = trimmed;
    setName(trimmed);
    onRenamed(trimmed);
    startRename(async () => {
      try {
        await renameWhiteboard(whiteboardId, trimmed);
      } catch {
        savedNameRef.current = previous;
        setName(previous);
        onRenamed(previous);
      }
    });
  }

  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b border-cy-gray-100 bg-white px-4">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setName(savedNameRef.current);
            e.currentTarget.blur();
          }
        }}
        maxLength={255}
        aria-label="Whiteboard name"
        className="min-w-0 max-w-md flex-1 rounded border border-transparent px-2 py-1 text-base font-semibold text-cy-gray-900 hover:border-cy-gray-200 focus:border-cy-blue-500 focus:outline-none"
      />
      <span
        className={`shrink-0 text-xs ${
          status.kind === "error" || status.kind === "conflict" ? "text-cy-red-500" : "text-cy-gray-400"
        }`}
        aria-live="polite"
      >
        {status.kind === "error" ? status.message : STATUS_TEXT[status.kind]}
      </span>
      <WhiteboardLinkPicker whiteboardId={whiteboardId} link={link} targets={linkTargets} />
      <div className="ml-auto flex items-center gap-1">
        <div className="relative">
          <button
            type="button"
            disabled={exporting}
            aria-haspopup="menu"
            aria-expanded={exportOpen}
            onClick={() => setExportOpen((o) => !o)}
            onBlur={(e) => {
              if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) setExportOpen(false);
            }}
            className={`${buttonGhost} flex items-center gap-1 px-2.5 py-1.5 text-xs`}
          >
            <Download size={13} />
            {exporting ? "Exporting..." : "Export"}
          </button>
          {exportOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-30 mt-1 flex w-36 flex-col rounded-card border border-cy-gray-100 bg-white py-1 shadow-md"
            >
              {(["png", "svg"] as const).map((format) => (
                <button
                  key={format}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setExportOpen(false);
                    onExport(format);
                  }}
                  className="px-3 py-1.5 text-left text-xs text-cy-gray-800 hover:bg-cy-gray-050"
                >
                  {format === "png" ? "PNG image" : "SVG image"}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          disabled={isDuplicating}
          onClick={() =>
            startDuplicate(async () => {
              await flush();
              await duplicateWhiteboard(whiteboardId);
            })
          }
          className={`${buttonGhost} px-2.5 py-1.5 text-xs`}
        >
          {isDuplicating ? "Duplicating..." : "Duplicate"}
        </button>
        {onDelete && (
          <ConfirmDeleteButton action={onDelete} confirmMessage={`Delete the whiteboard "${name}"? This can't be undone.`} />
        )}
      </div>
    </div>
  );
}
