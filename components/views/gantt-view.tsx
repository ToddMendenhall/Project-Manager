"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { STATUS_BAR_COLORS } from "@/components/status-badge";
import { statusLabel, dateInputValue } from "@/lib/fields";
import type { GanttKind, GanttNode } from "@/lib/gantt-types";

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_WIDTH = 32; // px
const INDENT_WIDTH = 16; // px per depth level

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function diffDays(a: Date, b: Date) {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / DAY_MS);
}

function addDays(d: Date, days: number) {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

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

  // Re-sync when the server sends fresh items (e.g. after a filter change or revalidation).
  useEffect(() => {
    setDates(flattenDates(items));
  }, [items]);

  useEffect(() => {
    function handleMove(e: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      const deltaDays = Math.round((e.clientX - drag.pointerStartX) / DAY_WIDTH);

      setDates((prev) => {
        const entry = prev[drag.itemId];
        if (!entry) return prev;
        let next = entry;

        if (drag.edge === "start") {
          let newStart = addDays(drag.originStart!, deltaDays);
          if (entry.end && newStart > entry.end) newStart = entry.end;
          next = { ...entry, start: newStart };
        } else if (drag.edge === "end") {
          let newEnd = addDays(drag.originEnd!, deltaDays);
          if (entry.start && newEnd < entry.start) newEnd = entry.start;
          next = { ...entry, end: newEnd };
        } else if (drag.originStart && !drag.originEnd) {
          // Dot with only a start date — drag creates/moves the missing due date.
          let newEnd = addDays(drag.originStart, deltaDays);
          if (newEnd < drag.originStart) newEnd = drag.originStart;
          next = { ...entry, end: newEnd };
        } else if (drag.originEnd && !drag.originStart) {
          // Dot with only a due date — drag creates/moves the missing start date.
          let newStart = addDays(drag.originEnd, deltaDays);
          if (newStart > drag.originEnd) newStart = drag.originEnd;
          next = { ...entry, start: newStart };
        }

        return next === entry ? prev : { ...prev, [drag.itemId]: next };
      });
    }

    function handleUp() {
      const drag = dragRef.current;
      dragRef.current = null;
      setDraggingId(null);
      if (!drag) return;

      setDates((prev) => {
        const entry = prev[drag.itemId];
        if (!entry) return prev;
        const startChanged = (entry.start?.getTime() ?? null) !== (drag.originStart?.getTime() ?? null);
        const endChanged = (entry.end?.getTime() ?? null) !== (drag.originEnd?.getTime() ?? null);
        if (startChanged || endChanged) {
          startTransition(async () => {
            try {
              await drag.onDateChange(drag.itemId, dateInputValue(entry.start), dateInputValue(entry.end));
            } catch {
              setDates((p) => ({ ...p, [drag.itemId]: { start: drag.originStart, end: drag.originEnd } }));
            }
          });
        }
        return prev;
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

  if (rows.length === 0) {
    return <p className="text-sm text-gray-500">No items have start or due dates yet.</p>;
  }

  const today = startOfDay(new Date());
  const allDates = rows.flatMap((r) => [dates[r.node.id].start, dates[r.node.id].end].filter((d): d is Date => !!d));
  const earliest = new Date(Math.min(...allDates.map((d) => d.getTime()), today.getTime()));
  const latest = new Date(Math.max(...allDates.map((d) => d.getTime()), today.getTime()));

  const rangeStart = new Date(earliest);
  rangeStart.setDate(rangeStart.getDate() - 3);
  const rangeEnd = new Date(latest);
  rangeEnd.setDate(rangeEnd.getDate() + 3);

  const totalDays = diffDays(rangeEnd, rangeStart) + 1;
  const days = Array.from({ length: totalDays }, (_, i) => {
    const d = new Date(rangeStart);
    d.setDate(rangeStart.getDate() + i);
    return d;
  });

  const weeks: { label: string; days: Date[] }[] = [];
  for (const day of days) {
    if (weeks.length === 0 || day.getDay() === 0) {
      weeks.push({ label: "", days: [] });
    }
    weeks[weeks.length - 1].days.push(day);
  }
  for (const week of weeks) {
    const first = week.days[0];
    const last = week.days[week.days.length - 1];
    week.label = `${first.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${last.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  }

  const todayOffset = diffDays(today, rangeStart);
  const gridWidth = totalDays * DAY_WIDTH;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex overflow-hidden rounded border border-gray-200 bg-white">
        <div className="flex w-56 shrink-0 flex-col border-r border-gray-200">
          <div className="h-[52px] shrink-0 border-b border-gray-200" />
          {rows.map((row) => (
            <div
              key={row.node.id}
              className="flex h-10 shrink-0 items-center gap-1 border-b border-gray-100 pr-3 last:border-0"
              style={{ paddingLeft: 8 + row.depth * INDENT_WIDTH }}
            >
              {row.hasVisibleChildren ? (
                <button
                  type="button"
                  onClick={() => toggleExpand(row.node.id)}
                  aria-label={expanded.has(row.node.id) ? "Collapse" : "Expand"}
                  className="flex h-6 w-6 shrink-0 items-center justify-center text-xl leading-none text-gray-400 hover:text-gray-700"
                >
                  {expanded.has(row.node.id) ? "▾" : "▸"}
                </button>
              ) : (
                <span className="w-6 shrink-0" />
              )}
              <Link
                href={row.node.href}
                className="truncate text-sm text-gray-900 hover:underline"
                title={row.node.title}
              >
                {row.node.title}
              </Link>
            </div>
          ))}
        </div>

        <div className="overflow-x-auto">
          <div style={{ width: gridWidth }}>
            <div className="flex h-[52px] shrink-0 flex-col border-b border-gray-200">
              <div className="flex h-6">
                {weeks.map((week, i) => (
                  <div
                    key={i}
                    style={{ width: week.days.length * DAY_WIDTH }}
                    className="shrink-0 truncate border-r border-gray-100 px-2 text-[11px] font-medium text-gray-500"
                  >
                    {week.label}
                  </div>
                ))}
              </div>
              <div className="flex h-[26px]">
                {days.map((day, i) => {
                  const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                  const isToday = diffDays(day, today) === 0;
                  return (
                    <div
                      key={i}
                      style={{ width: DAY_WIDTH }}
                      className={`flex shrink-0 items-center justify-center border-r border-gray-100 text-[11px] ${
                        isWeekend ? "bg-gray-50 text-gray-400" : "text-gray-500"
                      } ${isToday ? "font-semibold text-gray-900" : ""}`}
                    >
                      {day.getDate()}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="relative">
              {todayOffset >= 0 && todayOffset < totalDays && (
                <div
                  className="pointer-events-none absolute inset-y-0 z-10 w-px bg-red-400"
                  style={{ left: todayOffset * DAY_WIDTH + DAY_WIDTH / 2 }}
                />
              )}
              {rows.map((row) => {
                const { node } = row;
                const { start, end } = dates[node.id];
                const barColor = STATUS_BAR_COLORS[node.status] ?? "bg-gray-400";
                const isDragging = draggingId === node.id;
                const draggable = !!actionsByKind[node.kind];

                if (start && end) {
                  const offset = Math.max(0, diffDays(start, rangeStart));
                  const span = Math.max(1, diffDays(end, start) + 1);
                  const left = offset * DAY_WIDTH + 2;
                  const width = Math.max(span * DAY_WIDTH - 4, 8);
                  return (
                    <div key={node.id} className="relative h-10 border-b border-gray-100 last:border-0">
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

                const point = (start ?? end)!;
                const offset = Math.max(0, diffDays(point, rangeStart));
                return (
                  <div key={node.id} className="relative h-10 border-b border-gray-100 last:border-0">
                    <div
                      onPointerDown={draggable ? (e) => beginDrag(node, "dot", e) : undefined}
                      title={`${node.title}: ${point.toLocaleDateString()} (${statusLabel(node.status)})${
                        draggable ? " — drag to set the missing date" : ""
                      }`}
                      className={`absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full ${barColor} ${
                        draggable ? "cursor-ew-resize" : ""
                      } ${isDragging ? "opacity-80" : ""}`}
                      style={{ left: offset * DAY_WIDTH + DAY_WIDTH / 2 - 5 }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {hiddenTopLevel > 0 && (
        <p className="text-xs text-gray-400">
          {hiddenTopLevel} item{hiddenTopLevel === 1 ? "" : "s"} without a start or due date (or any dated
          descendant) {hiddenTopLevel === 1 ? "isn't" : "aren't"} shown on the timeline.
        </p>
      )}
    </div>
  );
}
