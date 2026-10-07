"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { STATUS_BAR_COLORS } from "@/components/status-badge";
import { statusLabel } from "@/lib/fields";
import { formatLocalDate, localDateKey, toLocalCalendarDate } from "@/lib/dates";
import type { GanttKind, GanttNode } from "@/lib/gantt-types";
import {
  GanttTimelineHeader,
  GanttZoomControls,
  addDays,
  buildTimeline,
  useToday,
  descendantSpan,
  SummaryBar,
  CENTERED_Y,
  SUMMARY_STACKED_Y,
  diffDays,
  useGanttZoom,
  useTimelineScroll,
} from "@/components/views/gantt-timeline";
import { SAVE_FAILED, showNotice } from "@/components/notice";

const INDENT_WIDTH = 16; // px per depth level

type ItemDates = { start: Date | null; end: Date | null };
type DateChangeHandler = (id: string, startDate: string, endDate: string) => Promise<void>;

function flattenDates(nodes: GanttNode[], map: Record<string, ItemDates> = {}): Record<string, ItemDates> {
  for (const node of nodes) {
    map[node.id] = {
      // Stored dates are midnight UTC; read them as that calendar day in local
      // time, or every bar is a day early west of UTC (see lib/dates.ts).
      start: node.startDate ? toLocalCalendarDate(node.startDate) : null,
      end: node.endDate ? toLocalCalendarDate(node.endDate) : null,
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

/**
 * The dates after moving one edge by `deltaDays`; the other edge stays put.
 * A dot (only one date set) moves, or creates, the missing date. An edge
 * never crosses the other one.
 */
function shiftDates(edge: DragEdge, originStart: Date | null, originEnd: Date | null, deltaDays: number): ItemDates {
  if (edge === "start" && originStart) {
    let newStart = addDays(originStart, deltaDays);
    if (originEnd && newStart > originEnd) newStart = originEnd;
    return { start: newStart, end: originEnd };
  }
  if (edge === "end" && originEnd) {
    let newEnd = addDays(originEnd, deltaDays);
    if (originStart && newEnd < originStart) newEnd = originStart;
    return { start: originStart, end: newEnd };
  }
  if (edge === "dot" && originStart && !originEnd) {
    // Dot with only a start date — creates/moves the missing due date.
    let newEnd = addDays(originStart, deltaDays);
    if (newEnd < originStart) newEnd = originStart;
    return { start: originStart, end: newEnd };
  }
  if (edge === "dot" && originEnd && !originStart) {
    // Dot with only a due date — creates/moves the missing start date.
    let newStart = addDays(originEnd, deltaDays);
    if (newStart > originEnd) newStart = originEnd;
    return { start: newStart, end: originEnd };
  }
  return { start: originStart, end: originEnd };
}

const sameDay = (a: Date | null, b: Date | null) => (a?.getTime() ?? null) === (b?.getTime() ?? null);

/** Keyboard nudges save once the keys go quiet for this long, not on every press. */
const KEYBOARD_SAVE_DELAY_MS = 700;

type PendingNudge = {
  originStart: Date | null;
  originEnd: Date | null;
  latest: ItemDates;
  onDateChange: DateChangeHandler;
  timer: ReturnType<typeof setTimeout>;
};

/**
 * The item a Gantt page belongs to (e.g. the Program on its own Gantt tab),
 * shown as a pinned top row whose summary bar spans every date beneath it.
 * The row shows just the name; the page header carries the dates
 * (`itemHeaderMeta` in lib/item-header.ts).
 */
export type GanttSummaryRow = { title: string; href: string };

export function GanttView({
  items,
  summary,
  onPortfolioDateChange,
  onProgramDateChange,
  onProjectDateChange,
  onTaskDateChange,
}: {
  items: GanttNode[];
  summary?: GanttSummaryRow;
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
  const today = useToday();
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
      const next = shiftDates(drag.edge, drag.originStart, drag.originEnd, deltaDays);
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
      if (sameDay(start, drag.originStart) && sameDay(end, drag.originEnd)) return;

      startTransition(async () => {
        try {
          await drag.onDateChange(drag.itemId, start ? localDateKey(start) : "", end ? localDateKey(end) : "");
        } catch {
          setDates((p) => ({ ...p, [drag.itemId]: { start: drag.originStart, end: drag.originEnd } }));
          showNotice(SAVE_FAILED);
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

  // Keyboard nudges waiting to be saved, per item. Cleared on unmount.
  const pendingRef = useRef(new Map<string, PendingNudge>());
  // The latest dates, including nudges not rendered yet: key repeat can fire
  // several keydowns before React re-renders, and each must build on the last.
  const latestDatesRef = useRef(dates);
  latestDatesRef.current = dates;
  useEffect(() => {
    const pending = pendingRef.current;
    return () => pending.forEach((p) => clearTimeout(p.timer));
  }, []);

  /**
   * The keyboard alternative to dragging: a focused bar end or dot moves by
   * a day per ←/→ (a week with Shift). Dates update at once and are saved
   * after a short pause, so holding a key costs one save, not one per day.
   */
  function handleEdgeKeyDown(node: GanttNode, edge: DragEdge, e: React.KeyboardEvent) {
    const step = e.shiftKey ? 7 : 1;
    const delta =
      e.key === "ArrowRight" || e.key === "ArrowUp" ? step : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -step : 0;
    if (!delta || e.altKey || e.ctrlKey || e.metaKey) return;
    const onDateChange = actionsByKind[node.kind];
    const current = latestDatesRef.current[node.id];
    if (!onDateChange || !current) return;
    e.preventDefault();

    const next = shiftDates(edge, current.start, current.end, delta);
    if (sameDay(next.start, current.start) && sameDay(next.end, current.end)) return;
    latestDatesRef.current = { ...latestDatesRef.current, [node.id]: next };
    setDates((prev) => ({ ...prev, [node.id]: next }));

    const pending = pendingRef.current;
    const existing = pending.get(node.id);
    if (existing) clearTimeout(existing.timer);
    const entry: PendingNudge = {
      originStart: existing?.originStart ?? current.start,
      originEnd: existing?.originEnd ?? current.end,
      latest: next,
      onDateChange,
      timer: setTimeout(() => {
        pending.delete(node.id);
        if (sameDay(entry.latest.start, entry.originStart) && sameDay(entry.latest.end, entry.originEnd)) return;
        const { start, end } = entry.latest;
        startTransition(async () => {
          try {
            await entry.onDateChange(node.id, start ? localDateKey(start) : "", end ? localDateKey(end) : "");
          } catch {
            setDates((p) => ({ ...p, [node.id]: { start: entry.originStart, end: entry.originEnd } }));
            showNotice(SAVE_FAILED);
          }
        });
      }, KEYBOARD_SAVE_DELAY_MS),
    };
    pending.set(node.id, entry);

    // A dot that gains its missing date becomes a bar; keep focus on the end that moved.
    if (edge === "dot") {
      const movedEdge = current.start ? "end" : "start";
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(`[data-gantt-handle="${CSS.escape(`${node.id}:${movedEdge}`)}"]`)?.focus();
      });
    }
  }

  /** Accessible slider props for a bar end or dot, so screen readers hear the date and how to change it. */
  function handleProps(node: GanttNode, edge: DragEdge, date: Date) {
    const what = edge === "start" ? "Start date" : edge === "end" ? "Due date" : "Date";
    return {
      role: "slider",
      tabIndex: 0,
      "data-gantt-handle": `${node.id}:${edge}`,
      "aria-label": `${what} of ${node.title}`,
      "aria-valuenow": Math.round(date.getTime() / 86_400_000),
      "aria-valuetext": formatLocalDate(date),
      "aria-keyshortcuts": "ArrowLeft ArrowRight Shift+ArrowLeft Shift+ArrowRight",
      onKeyDown: (e: React.KeyboardEvent) => handleEdgeKeyDown(node, edge, e),
    } as const;
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Under a summary row the items are its children, so they indent one level.
  const rows = buildRows(items, summary ? 1 : 0, expanded, dates);
  const hiddenTopLevel = items.filter((n) => !isVisible(n, dates)).length;
  // Every row with visible children gets a summary bar spanning its
  // descendants (alongside its own bar or dot, if it has dates) — computed
  // from the live `dates`, so it follows a drag.
  const spans = new Map(
    rows.flatMap((r) => {
      if (!r.hasVisibleChildren) return [];
      const span = descendantSpan(r.node, (n) => dates[n.id] ?? { start: null, end: null });
      return span ? [[r.node.id, span] as const] : [];
    }),
  );
  // The page's own item always summarizes everything beneath it, whatever
  // its own planned dates (those are in the page header).
  const summarySpan = summary
    ? descendantSpan({ id: "", children: items } as GanttNode, (n) => dates[n.id] ?? { start: null, end: null })
    : null;
  // Include the spans: a collapsed row's children aren't rows, but its
  // summary bar still has to fit on the timeline.
  const allDates = [
    ...rows.flatMap((r) => [dates[r.node.id].start, dates[r.node.id].end].filter((d): d is Date => !!d)),
    ...[...spans.values(), ...(summarySpan ? [summarySpan] : [])].flatMap((span) => [span.start, span.end]),
  ];
  const timeline = rows.length > 0 ? buildTimeline(allDates, zoom.level, today) : null;
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
          {summary && summarySpan && (
            <div
              data-gantt-summary-row
              className="flex h-10 shrink-0 items-center border-b border-cy-gray-200 bg-cy-gray-025 pl-3 pr-3"
            >
              <Link
                href={summary.href}
                className="truncate text-[13px] font-semibold text-cy-gray-900 hover:text-cy-blue-600 hover:underline"
                title={summary.title}
              >
                {summary.title}
              </Link>
            </div>
          )}
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
              {summary && summarySpan && (
                <div className="relative h-10 border-b border-cy-gray-200 bg-cy-gray-025">
                  <SummaryBar
                    title={summary.title}
                    href={summary.href}
                    span={summarySpan}
                    rangeStart={rangeStart}
                    dayWidth={dayWidth}
                  />
                </div>
              )}
              {rows.map((row) => {
                const { node } = row;
                const { start, end } = dates[node.id];
                const barColor = STATUS_BAR_COLORS[node.status] ?? "bg-cy-gray-300";
                const isDragging = draggingId === node.id;
                const draggable = !!actionsByKind[node.kind];
                const rowSpan = spans.get(node.id);
                // With a summary bar in the row, its own bar/dot sits lower.
                const y = rowSpan && (start || end) ? SUMMARY_STACKED_Y : CENTERED_Y;
                const stackedSummary = rowSpan && (start || end) && (
                  <SummaryBar
                    title={node.title}
                    href={node.href}
                    span={rowSpan}
                    rangeStart={rangeStart}
                    dayWidth={dayWidth}
                    placement="top"
                  />
                );

                if (start && end) {
                  const offset = Math.max(0, diffDays(start, rangeStart));
                  const span = Math.max(1, diffDays(end, start) + 1);
                  const left = offset * dayWidth + 2;
                  const width = Math.max(span * dayWidth - 4, 8);
                  return (
                    <div key={node.id} className="relative h-10 border-b border-cy-gray-100 last:border-0">
                      {stackedSummary}
                      <Link
                        href={node.href}
                        title={`${node.title}: ${formatLocalDate(start)} – ${formatLocalDate(end)} (${statusLabel(node.status)})`}
                        className={`absolute ${y} flex h-5 items-center overflow-hidden rounded-full px-2 text-[11px] font-medium text-white ${barColor} ${isDragging ? "opacity-80" : ""}`}
                        style={{ left, width }}
                      >
                        <span className="truncate">{statusLabel(node.status)}</span>
                      </Link>
                      {draggable && (
                        <>
                          <div
                            {...handleProps(node, "start", start)}
                            onPointerDown={(e) => beginDrag(node, "start", e)}
                            title="Drag, or focus and use the arrow keys, to change the start date"
                            className={`absolute ${y} h-5 w-2 cursor-ew-resize rounded-l-full hover:bg-black/20 focus-visible:bg-black/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cy-cyan-500`}
                            style={{ left: left - 1 }}
                          />
                          <div
                            {...handleProps(node, "end", end)}
                            onPointerDown={(e) => beginDrag(node, "end", e)}
                            title="Drag, or focus and use the arrow keys, to change the due date"
                            className={`absolute ${y} h-5 w-2 cursor-ew-resize rounded-r-full hover:bg-black/20 focus-visible:bg-black/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cy-cyan-500`}
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
                  return (
                    <div key={node.id} className="relative h-10 border-b border-cy-gray-100 last:border-0">
                      {rowSpan && (
                        <SummaryBar
                          title={node.title}
                          href={node.href}
                          span={rowSpan}
                          rangeStart={rangeStart}
                          dayWidth={dayWidth}
                        />
                      )}
                    </div>
                  );
                }

                const point = (start ?? end)!;
                const offset = Math.max(0, diffDays(point, rangeStart));
                return (
                  <div key={node.id} className="relative h-10 border-b border-cy-gray-100 last:border-0">
                    {stackedSummary}
                    <div
                      {...(draggable ? handleProps(node, "dot", point) : {})}
                      {...(draggable ? { "aria-label": `${start ? "Due" : "Start"} date of ${node.title} (not set)` } : {})}
                      onPointerDown={draggable ? (e) => beginDrag(node, "dot", e) : undefined}
                      title={`${node.title}: ${formatLocalDate(point)} (${statusLabel(node.status)})${
                        draggable ? " — drag, or focus and use the arrow keys, to set the missing date" : ""
                      }`}
                      className={`absolute ${y} h-2.5 w-2.5 rounded-full ${barColor} ${
                        draggable ? "cursor-ew-resize focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cy-cyan-500" : ""
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
