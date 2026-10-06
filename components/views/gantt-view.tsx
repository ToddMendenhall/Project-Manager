"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { STATUS_BAR_COLORS } from "@/components/status-badge";
import { statusLabel, dateInputValue } from "@/lib/fields";
import type { GanttKind, GanttNode } from "@/lib/gantt-types";
import {
  GanttTimelineHeader,
  GanttZoomControls,
  addDays,
  buildTimeline,
  diffDays,
  startOfDay,
  useGanttZoom,
  useTimelineScroll,
} from "@/components/views/gantt-timeline";

const INDENT_WIDTH = 16; // px per depth level

type ItemDates = { start: Date | null; end: Date | null };
type DateChangeHandler = (id: string, startDate: string, endDate: string) => Promise<void>;

function flattenDates(nodes: GanttNode[], map: Record<string, ItemDates> = {}): Record<string, ItemDates> {
  for (const node of nodes) {
    map[node.id] = {
      start: node.startDate ? startOfDay(new Date(node.startDate)) : null,
      end: node.endDate ? startOfDay(new Date(node.endDate)) : null,
    };
    if (node.children) flattenDates(node.children, map);
  }
  return map;
}

/** A node is worth showing if it has a date itself, or any descendant does — otherwise it (and its subtree) stay hidden. */
function isVisible(node: GanttNode, dates: Record<string, ItemDates>): boolean {
  const d = dates[node.id];
  if (d?.start || d?.end) return true;
  return (node.children ?? []).some((child) => isVisible(child, dates));
}

type Row = { node: GanttNode; depth: number; hasVisibleChildren: boolean };

function buildRows(
  nodes: GanttNode[],
  depth: number,
  expanded: Set<string>,
  dates: Record<string, ItemDates>,
  out: Row[] = [],
): Row[] {
  for (const node of nodes) {
    if (!isVisible(node, dates)) continue;
    const visibleChildren = (node.children ?? []).filter((child) => isVisible(child, dates));
    out.push({ node, depth, hasVisibleChildren: visibleChildren.length > 0 });
    if (visibleChildren.length > 0 && expanded.has(node.id)) {
      buildRows(visibleChildren, depth + 1, expanded, dates, out);
    }
  }
  return out;
}

type DragEdge = "start" | "end" | "dot";
type DragAnchor = {
  itemId: string;
  edge: DragEdge;
  pointerStartX: number;
  originStart: Date | null;
  originEnd: Date | null;
  onDateChange: DateChangeHandler;
  /** Dates as of the last pointermove; unset until the pointer actually moves. */
  latest?: ItemDates;
};

export function GanttView({
  items,
  onPortfolioDateChange,
  onProgramDateChange,
  onProjectDateChange,
  onTaskDateChange,
}: {
  items: GanttNode[];
  onPortfolioDateChange?: DateChangeHandler;
  onProgramDateChange?: DateChangeHandler;
  onProjectDateChange?: DateChangeHandler;
  onTaskDateChange?: DateChangeHandler;
}) {
  const actionsByKind: Partial<Record<GanttKind, DateChangeHandler>> = {
    portfolio: onPortfolioDateChange,
    program: onProgramDateChange,
    project: onProjectDateChange,
    task: onTaskDateChange,
    // checklistItem intentionally has no handler — it only ever has a due
    // date (no startDate column exists for it), so it's always read-only.
  };

  const [dates, setDates] = useState<Record<string, ItemDates>>(() => flattenDates(items));
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragRef = useRef<DragAnchor | null>(null);
  const [, startTransition] = useTransition();
  const zoom = useGanttZoom();
  // Read by the window-level pointermove listener, which is registered once.
  const dayWidthRef = useRef(zoom.level.dayWidth);
  dayWidthRef.current = zoom.level.dayWidth;

  // Re-sync when the server sends fresh items (e.g. after a filter change or revalidation).
  useEffect(() => {
    setDates(flattenDates(items));
  }, [items]);

  useEffect(() => {
    function handleMove(e: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      const deltaDays = Math.round((e.clientX - drag.pointerStartX) / dayWidthRef.current);

      // Only the dragged edge moves, so the other one is still its origin value.
      const { originStart, originEnd } = drag;
      let next: ItemDates = { start: originStart, end: originEnd };
      if (drag.edge === "start") {
        let newStart = addDays(originStart!, deltaDays);
        if (originEnd && newStart > originEnd) newStart = originEnd;
        next = { start: newStart, end: originEnd };
      } else if (drag.edge === "end") {
        let newEnd = addDays(originEnd!, deltaDays);
        if (originStart && newEnd < originStart) newEnd = originStart;
        next = { start: originStart, end: newEnd };
      } else if (originStart && !originEnd) {
        // Dot with only a start date — drag creates/moves the missing due date.
        let newEnd = addDays(originStart, deltaDays);
        if (newEnd < originStart) newEnd = originStart;
        next = { start: originStart, end: newEnd };
      } else if (originEnd && !originStart) {
        // Dot with only a due date — drag creates/moves the missing start date.
        let newStart = addDays(originEnd, deltaDays);
        if (newStart > originEnd) newStart = originEnd;
        next = { start: newStart, end: originEnd };
      }

      drag.latest = next;
      setDates((prev) => (prev[drag.itemId] ? { ...prev, [drag.itemId]: next } : prev));
    }

    function handleUp() {
      const drag = dragRef.current;
      dragRef.current = null;
      setDraggingId(null);
      if (!drag?.latest) return;

      // Saved from here, not from inside a setDates updater — updaters run
      // during render, where starting a transition is not allowed.
      const { start, end } = drag.latest;
      const startChanged = (start?.getTime() ?? null) !== (drag.originStart?.getTime() ?? null);
      const endChanged = (end?.getTime() ?? null) !== (drag.originEnd?.getTime() ?? null);
      if (!startChanged && !endChanged) return;

      startTransition(async () => {
        try {
          await drag.onDateChange(drag.itemId, dateInputValue(start), dateInputValue(end));
        } catch {
          setDates((p) => ({ ...p, [drag.itemId]: { start: drag.originStart, end: drag.originEnd } }));
        }
      });
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [startTransition]);

  function beginDrag(node: GanttNode, edge: DragEdge, e: React.PointerEvent) {
    const onDateChange = actionsByKind[node.kind];
    if (!onDateChange) return;
    e.preventDefault();
    e.stopPropagation();
    const entry = dates[node.id];
    dragRef.current = {
      itemId: node.id,
      edge,
      pointerStartX: e.clientX,
      originStart: entry?.start ?? null,
      originEnd: entry?.end ?? null,
      onDateChange,
    };
    setDraggingId(node.id);
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const rows = buildRows(items, 0, expanded, dates);
  const hiddenTopLevel = items.filter((n) => !isVisible(n, dates)).length;
  const allDates = rows.flatMap((r) => [dates[r.node.id].start, dates[r.node.id].end].filter((d): d is Date => !!d));
  const timeline = rows.length > 0 ? buildTimeline(allDates, zoom.level) : null;
  const scroll = useTimelineScroll(timeline, zoom);

  if (!timeline) {
    return <p className="text-sm text-cy-gray-500">No items have start or due dates yet.</p>;
  }

  const { rangeStart, dayWidth, gridWidth } = timeline;

  return (
    <div className="flex flex-col gap-2">
      <GanttZoomControls zoom={zoom} onToday={scroll.scrollToToday} />
      <div className="flex overflow-hidden rounded-card border border-cy-gray-200 bg-white">
        <div className="flex w-56 shrink-0 flex-col border-r border-cy-gray-200">
          <div className="h-[52px] shrink-0 border-b border-cy-gray-200" />
          {rows.map((row) => (
            <div
              key={row.node.id}
              className="flex h-10 shrink-0 items-center gap-1 border-b border-cy-gray-100 pr-3 last:border-0"
              style={{ paddingLeft: 8 + row.depth * INDENT_WIDTH }}
            >
              {row.hasVisibleChildren ? (
                <button
                  type="button"
                  onClick={() => toggleExpand(row.node.id)}
                  aria-label={expanded.has(row.node.id) ? "Collapse" : "Expand"}
                  className="flex h-6 w-6 shrink-0 items-center justify-center text-cy-gray-400 hover:text-cy-gray-700"
                >
                  <ChevronRight
                    size={14}
                    strokeWidth={2}
                    className={`transition-transform duration-fast ${expanded.has(row.node.id) ? "rotate-90" : ""}`}
                  />
                </button>
              ) : (
                <span className="w-6 shrink-0" />
              )}
              <Link
                href={row.node.href}
                className="truncate text-[13px] text-cy-gray-900 hover:text-cy-blue-600 hover:underline"
                title={row.node.title}
              >
                {row.node.title}
              </Link>
            </div>
          ))}
        </div>

        <div ref={scroll.scrollRef} onScroll={scroll.onScroll} className="overflow-x-auto">
          <div className="relative" style={{ width: gridWidth }}>
            <GanttTimelineHeader timeline={timeline} />

            <div className="relative">
              {rows.map((row) => {
                const { node } = row;
                const { start, end } = dates[node.id];
                const barColor = STATUS_BAR_COLORS[node.status] ?? "bg-cy-gray-300";
                const isDragging = draggingId === node.id;
                const draggable = !!actionsByKind[node.kind];

                if (start && end) {
                  const offset = Math.max(0, diffDays(start, rangeStart));
                  const span = Math.max(1, diffDays(end, start) + 1);
                  const left = offset * dayWidth + 2;
                  const width = Math.max(span * dayWidth - 4, 8);
                  return (
                    <div key={node.id} className="relative h-10 border-b border-cy-gray-100 last:border-0">
                      <Link
                        href={node.href}
                        title={`${node.title}: ${start.toLocaleDateString()} – ${end.toLocaleDateString()} (${statusLabel(node.status)})`}
                        className={`absolute top-1/2 flex h-5 -translate-y-1/2 items-center overflow-hidden rounded-full px-2 text-[11px] font-medium text-white ${barColor} ${isDragging ? "opacity-80" : ""}`}
                        style={{ left, width }}
                      >
                        <span className="truncate">{statusLabel(node.status)}</span>
                      </Link>
                      {draggable && (
                        <>
                          <div
                            onPointerDown={(e) => beginDrag(node, "start", e)}
                            title="Drag to change the start date"
                            className="absolute top-1/2 h-5 w-2 -translate-y-1/2 cursor-ew-resize rounded-l-full hover:bg-black/20"
                            style={{ left: left - 1 }}
                          />
                          <div
                            onPointerDown={(e) => beginDrag(node, "end", e)}
                            title="Drag to change the due date"
                            className="absolute top-1/2 h-5 w-2 -translate-y-1/2 cursor-ew-resize rounded-r-full hover:bg-black/20"
                            style={{ left: left + width - 7 }}
                          />
                        </>
                      )}
                    </div>
                  );
                }

                // A row with no dates of its own is still shown when a
                // descendant has dates (see isVisible) — e.g. an undated
                // Portfolio above dated Projects. Keep the empty row so the
                // timeline stays aligned with the label column.
                if (!start && !end) {
                  return <div key={node.id} className="relative h-10 border-b border-cy-gray-100 last:border-0" />;
                }

                const point = (start ?? end)!;
                const offset = Math.max(0, diffDays(point, rangeStart));
                return (
                  <div key={node.id} className="relative h-10 border-b border-cy-gray-100 last:border-0">
                    <div
                      onPointerDown={draggable ? (e) => beginDrag(node, "dot", e) : undefined}
                      title={`${node.title}: ${point.toLocaleDateString()} (${statusLabel(node.status)})${
                        draggable ? " — drag to set the missing date" : ""
                      }`}
                      className={`absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full ${barColor} ${
                        draggable ? "cursor-ew-resize" : ""
                      } ${isDragging ? "opacity-80" : ""}`}
                      style={{ left: offset * dayWidth + dayWidth / 2 - 5 }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {hiddenTopLevel > 0 && (
        <p className="text-xs text-cy-gray-400">
          {hiddenTopLevel} item{hiddenTopLevel === 1 ? "" : "s"} without a start or due date (or any dated
          descendant) {hiddenTopLevel === 1 ? "isn't" : "aren't"} shown on the timeline.
        </p>
      )}
    </div>
  );
}
