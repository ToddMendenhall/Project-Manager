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
  addEdge,
  reconnectEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useStore,
  type Connection,
  type OnConnect,
  type OnReconnect,
} from "@xyflow/react";
import { Grid3x3 } from "lucide-react";
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
  createNode,
  docToFlow,
  flowToDoc,
  newId,
  type EditorContextValue,
  type Tool,
  type WbEdge,
  type WbNode,
} from "./model";
import { nodeTypes } from "./nodes";
import { edgeTypes } from "./connector-edge";
import { SelectionToolbar, ToolPalette, type SelectionSummary } from "./toolbars";

const AUTOSAVE_DELAY_MS = 1200;
const SAVE_RETRY_MS = 5000;
const VERSION_POLL_MS = 15000;
const HISTORY_LIMIT = 100;
const PASTE_OFFSET = 24;

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

function Editor({ whiteboardId, name: initialName, initialDoc, initialVersion, onDelete }: WhiteboardEditorProps) {
  const initialFlow = useMemo(() => docToFlow(initialDoc), [initialDoc]);
  const [nodes, setNodes, onNodesChange] = useNodesState<WbNode>(initialFlow.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<WbEdge>(initialFlow.edges);
  const { screenToFlowPosition, deleteElements } = useReactFlow<WbNode, WbEdge>();
  const connecting = useStore((s) => s.connection.inProgress);

  const [tool, setTool] = useState<Tool>("select");
  const [snap, setSnap] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Latest state for handlers registered once (keyboard, unmount flush).
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  // ---- Undo history --------------------------------------------------------
  // Snapshots are serialized docs. `committed` is the latest settled state;
  // any settled change pushes the previous one onto `past`. Mid-gesture
  // states (dragging, resizing) are skipped so one drag = one undo step.
  const initialSerialized = useMemo(() => JSON.stringify(initialDoc), [initialDoc]);
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

  // Notice someone else's save while this board is open.
  useEffect(() => {
    const timer = setInterval(async () => {
      if (document.visibilityState !== "visible" || savingRef.current || closedRef.current) return;
      if (statusRef.current.kind === "conflict") return;
      try {
        const remote = await getWhiteboardVersion(whiteboardId);
        if (remote && remote.version > versionRef.current) {
          setRemoteUpdate({ updatedByName: remote.updatedByName });
        }
      } catch {
        // Transient network error — try again next tick.
      }
    }, VERSION_POLL_MS);
    return () => clearInterval(timer);
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
    (creator: Exclude<Tool, "select" | "hand">, clientX: number, clientY: number) => {
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
      if (tool !== "select" && tool !== "hand") addNodeAt(tool, event.clientX, event.clientY);
    },
    [tool, addNodeAt],
  );

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
      setNodes((ns) => {
        const zs = ns.map((n) => n.zIndex ?? 0);
        const target = direction === "front" ? Math.max(...zs) + 1 : Math.min(...zs) - 1;
        return ns.map((n) => (n.selected ? { ...n, zIndex: target } : n));
      });
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
          };
          if (toolKeys[key]) setTool(toolKeys[key]);
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
      fontSize: shared(selectedNodes.map((n) => n.data.fontSize ?? DEFAULT_FONT_SIZE[n.type ?? "sticky"])),
      shape: shared(selectedNodes.map((n) => n.data.shape ?? null)),
      allShapes: selectedNodes.length > 0 && selectedNodes.every((n) => n.type === "shape"),
      routing: shared(edgeData.map((d) => d.routing)),
      arrow: shared(edgeData.map((d) => d.arrow)),
      dashed: shared(edgeData.map((d) => d.dashed)),
    };
  }, [selectedNodes, selectedEdges]);

  const placing = tool !== "select" && tool !== "hand";

  return (
    <div className="flex h-full flex-col">
      <EditorHeader
        whiteboardId={whiteboardId}
        initialName={initialName}
        status={status}
        flush={flush}
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
        className={`wb-canvas relative min-h-0 flex-1 ${placing ? "wb-placing" : ""} ${connecting ? "wb-connecting" : ""}`}
      >
        <EditorContext.Provider value={editorContext}>
          <ReactFlow<WbNode, WbEdge>
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onReconnect={onReconnect}
            onPaneClick={onPaneClick}
            onDoubleClick={onCanvasDoubleClick}
            onNodeDoubleClick={(_, node) => setEditingId(node.id)}
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
              nodeColor={(n) => (n.type === "text" ? "#d3d8dd" : PALETTE[(n.data as WbNode["data"]).color].fill)}
              nodeStrokeColor={(n) => PALETTE[(n.data as WbNode["data"]).color].stroke}
              nodeStrokeWidth={2}
            />
          </ReactFlow>
        </EditorContext.Provider>

        <ToolPalette
          tool={tool}
          onTool={setTool}
          canUndo={historyState.canUndo}
          canRedo={historyState.canRedo}
          onUndo={undo}
          onRedo={redo}
        />

        {summary && editingId === null && (
          <SelectionToolbar
            summary={summary}
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
  initialName,
  status,
  flush,
  onDelete,
}: {
  whiteboardId: string;
  initialName: string;
  status: SaveStatus;
  flush: () => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
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
    startRename(async () => {
      try {
        await renameWhiteboard(whiteboardId, trimmed);
      } catch {
        savedNameRef.current = previous;
        setName(previous);
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
      <div className="ml-auto flex items-center gap-1">
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
