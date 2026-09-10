"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { STATUS_BAR_COLORS } from "@/components/status-badge";
import { statusLabel, dateInputValue } from "@/lib/fields";

export type GanttItem = {
  id: string;
  title: string;
  status: string;
  href: string;
  startDate: Date | string | null;
  endDate: Date | string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_WIDTH = 32; // px

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

function datesFromItems(items: GanttItem[]): Record<string, ItemDates> {
  const map: Record<string, ItemDates> = {};
  for (const item of items) {
    map[item.id] = {
      start: item.startDate ? startOfDay(new Date(item.startDate)) : null,
      end: item.endDate ? startOfDay(new Date(item.endDate)) : null,
    };
  }
  return map;
}

type DragEdge = "start" | "end" | "dot";
type DragAnchor = { itemId: string; edge: DragEdge; pointerStartX: number; originStart: Date | null; originEnd: Date | null };

export function GanttView({
  items,
  onDateChange,
  readOnly = false,
}: {
  items: GanttItem[];
  onDateChange?: (id: string, startDate: string, endDate: string) => Promise<void>;
  readOnly?: boolean;
}) {
  const [dates, setDates] = useState<Record<string, ItemDates>>(() => datesFromItems(items));
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragRef = useRef<DragAnchor | null>(null);
  const [, startTransition] = useTransition();

  const draggable = !readOnly && !!onDateChange;

  // Re-sync when the server sends fresh items (e.g. after a filter change or revalidation).
  useEffect(() => {
    setDates(datesFromItems(items));
  }, [items]);

  useEffect(() => {
    if (!draggable) return;

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
      if (!drag || !onDateChange) return;

      setDates((prev) => {
        const entry = prev[drag.itemId];
        if (!entry) return prev;
        const startChanged = (entry.start?.getTime() ?? null) !== (drag.originStart?.getTime() ?? null);
        const endChanged = (entry.end?.getTime() ?? null) !== (drag.originEnd?.getTime() ?? null);
        if (startChanged || endChanged) {
          startTransition(async () => {
            try {
              await onDateChange(drag.itemId, dateInputValue(entry.start), dateInputValue(entry.end));
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
  }, [draggable, onDateChange, startTransition]);

  function beginDrag(itemId: string, edge: DragEdge, e: React.PointerEvent) {
    if (!draggable) return;
    e.preventDefault();
    e.stopPropagation();
    const entry = dates[itemId];
    dragRef.current = {
      itemId,
      edge,
      pointerStartX: e.clientX,
      originStart: entry?.start ?? null,
      originEnd: entry?.end ?? null,
    };
    setDraggingId(itemId);
  }

  const dated = items.filter((i) => dates[i.id]?.start || dates[i.id]?.end);
  const undated = items.filter((i) => !dates[i.id]?.start && !dates[i.id]?.end);

  if (dated.length === 0) {
    return <p className="text-sm text-gray-500">No items have start or due dates yet.</p>;
  }

  const today = startOfDay(new Date());
  const allDates = dated.flatMap((i) => [dates[i.id].start, dates[i.id].end].filter((d): d is Date => !!d));
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
          {dated.map((item) => (
            <div
              key={item.id}
              className="flex h-10 shrink-0 items-center border-b border-gray-100 px-3 last:border-0"
            >
              <Link href={item.href} className="truncate text-sm text-gray-900 hover:underline" title={item.title}>
                {item.title}
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
              {dated.map((item) => {
                const { start, end } = dates[item.id];
                const barColor = STATUS_BAR_COLORS[item.status] ?? "bg-gray-400";
                const isDragging = draggingId === item.id;

                if (start && end) {
                  const offset = Math.max(0, diffDays(start, rangeStart));
                  const span = Math.max(1, diffDays(end, start) + 1);
                  const left = offset * DAY_WIDTH + 2;
                  const width = Math.max(span * DAY_WIDTH - 4, 8);
                  return (
                    <div key={item.id} className="relative h-10 border-b border-gray-100 last:border-0">
                      <Link
                        href={item.href}
                        title={`${item.title}: ${start.toLocaleDateString()} – ${end.toLocaleDateString()} (${statusLabel(item.status)})`}
                        className={`absolute top-1/2 flex h-5 -translate-y-1/2 items-center overflow-hidden rounded-full px-2 text-[11px] font-medium text-white ${barColor} ${isDragging ? "opacity-80" : ""}`}
                        style={{ left, width }}
                      >
                        <span className="truncate">{statusLabel(item.status)}</span>
                      </Link>
                      {draggable && (
                        <>
                          <div
                            onPointerDown={(e) => beginDrag(item.id, "start", e)}
                            title="Drag to change the start date"
                            className="absolute top-1/2 h-5 w-2 -translate-y-1/2 cursor-ew-resize rounded-l-full hover:bg-black/20"
                            style={{ left: left - 1 }}
                          />
                          <div
                            onPointerDown={(e) => beginDrag(item.id, "end", e)}
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
                  <div key={item.id} className="relative h-10 border-b border-gray-100 last:border-0">
                    <div
                      onPointerDown={draggable ? (e) => beginDrag(item.id, "dot", e) : undefined}
                      title={`${item.title}: ${point.toLocaleDateString()} (${statusLabel(item.status)})${
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

      {undated.length > 0 && (
        <p className="text-xs text-gray-400">
          {undated.length} item{undated.length === 1 ? "" : "s"} without a start or due date{" "}
          {undated.length === 1 ? "isn't" : "aren't"} shown on the timeline.
        </p>
      )}
    </div>
  );
}
