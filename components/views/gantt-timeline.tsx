"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ZoomIn, ZoomOut } from "lucide-react";

/**
 * Shared timeline plumbing for the Gantt views (`GanttView`,
 * `ResourceGanttView`): date math, zoom levels, header rows, and the
 * scroll container that keeps the same date centered when the zoom changes.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function diffDays(a: Date, b: Date) {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / DAY_MS);
}

export function addDays(d: Date, days: number) {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

export type ZoomKey = "day" | "week" | "month" | "quarter";

type ZoomLevel = { key: ZoomKey; label: string; dayWidth: number };

// Ordered most zoomed-in first; `dayWidth` is px per calendar day.
export const ZOOM_LEVELS: ZoomLevel[] = [
  { key: "day", label: "Days", dayWidth: 32 },
  { key: "week", label: "Weeks", dayWidth: 10 },
  { key: "month", label: "Months", dayWidth: 3 },
  { key: "quarter", label: "Quarters", dayWidth: 1 },
];

const ZOOM_STORAGE_KEY = "gantt-zoom";

function isZoomKey(value: unknown): value is ZoomKey {
  return ZOOM_LEVELS.some((level) => level.key === value);
}

/** Current zoom level, remembered per browser so it sticks across Gantt pages. */
export function useGanttZoom() {
  const [zoomKey, setZoomKey] = useState<ZoomKey>("day");

  // Read after mount (not in the initializer) so server and client render the same markup.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(ZOOM_STORAGE_KEY);
      if (isZoomKey(saved)) setZoomKey(saved);
    } catch {
      // Storage unavailable (private mode, blocked site data) — keep the default.
    }
  }, []);

  function setZoom(next: ZoomKey) {
    setZoomKey(next);
    try {
      window.localStorage.setItem(ZOOM_STORAGE_KEY, next);
    } catch {
      // Not persisting is fine.
    }
  }

  const index = ZOOM_LEVELS.findIndex((level) => level.key === zoomKey);
  return {
    level: ZOOM_LEVELS[index],
    setZoom,
    zoomIn: () => setZoom(ZOOM_LEVELS[Math.max(0, index - 1)].key),
    zoomOut: () => setZoom(ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, index + 1)].key),
    canZoomIn: index > 0,
    canZoomOut: index < ZOOM_LEVELS.length - 1,
  };
}

type HeaderCell = { label: string; days: number; shaded?: boolean; highlighted?: boolean };

export type Timeline = {
  rangeStart: Date;
  totalDays: number;
  dayWidth: number;
  gridWidth: number;
  todayOffset: number;
  topRow: HeaderCell[];
  bottomRow: HeaderCell[];
};

const QUARTER_START_MONTH = (d: Date) => Math.floor(d.getMonth() / 3) * 3;

/** Snap the visible range outward to whole units so header cells line up with their boundaries. */
function paddedRange(earliest: Date, latest: Date, zoom: ZoomKey): [Date, Date] {
  switch (zoom) {
    case "day":
      return [addDays(earliest, -3), addDays(latest, 3)];
    case "week":
      return [addDays(earliest, -earliest.getDay()), addDays(latest, 6 - latest.getDay())];
    case "month":
      return [
        new Date(earliest.getFullYear(), earliest.getMonth(), 1),
        new Date(latest.getFullYear(), latest.getMonth() + 1, 0),
      ];
    case "quarter":
      return [
        new Date(earliest.getFullYear(), QUARTER_START_MONTH(earliest), 1),
        new Date(latest.getFullYear(), QUARTER_START_MONTH(latest) + 3, 0),
      ];
  }
}

/** Group consecutive days sharing `keyOf` into header cells. */
function group(
  days: Date[],
  keyOf: (d: Date) => string,
  labelOf: (first: Date, last: Date) => string,
  today: Date,
): HeaderCell[] {
  const cells: { key: string; first: Date; last: Date; days: number; highlighted: boolean }[] = [];
  for (const day of days) {
    const key = keyOf(day);
    const current = cells[cells.length - 1];
    const isToday = diffDays(day, today) === 0;
    if (current && current.key === key) {
      current.last = day;
      current.days++;
      current.highlighted ||= isToday;
    } else {
      cells.push({ key, first: day, last: day, days: 1, highlighted: isToday });
    }
  }
  return cells.map((c) => ({ label: labelOf(c.first, c.last), days: c.days, highlighted: c.highlighted }));
}

const shortDate = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
const weekKey = (d: Date) => addDays(d, -d.getDay()).toDateString();
const monthKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;
const quarterKey = (d: Date) => `${d.getFullYear()}-${QUARTER_START_MONTH(d)}`;
const yearKey = (d: Date) => `${d.getFullYear()}`;

export function buildTimeline(dates: Date[], zoom: ZoomLevel): Timeline {
  const today = startOfDay(new Date());
  const earliest = new Date(Math.min(...dates.map((d) => d.getTime()), today.getTime()));
  const latest = new Date(Math.max(...dates.map((d) => d.getTime()), today.getTime()));
  const [rangeStart, rangeEnd] = paddedRange(earliest, latest, zoom.key);

  const totalDays = diffDays(rangeEnd, rangeStart) + 1;
  const days = Array.from({ length: totalDays }, (_, i) => addDays(rangeStart, i));

  let topRow: HeaderCell[];
  let bottomRow: HeaderCell[];
  switch (zoom.key) {
    case "day":
      topRow = group(days, weekKey, (first, last) => `${shortDate(first)} – ${shortDate(last)}`, today);
      bottomRow = days.map((day) => ({
        label: String(day.getDate()),
        days: 1,
        shaded: day.getDay() === 0 || day.getDay() === 6,
        highlighted: diffDays(day, today) === 0,
      }));
      break;
    case "week":
      topRow = group(days, monthKey, (first) => first.toLocaleDateString(undefined, { month: "short", year: "numeric" }), today);
      bottomRow = group(days, weekKey, (first) => shortDate(first), today);
      break;
    case "month":
      topRow = group(days, yearKey, (first) => String(first.getFullYear()), today);
      bottomRow = group(days, monthKey, (first) => first.toLocaleDateString(undefined, { month: "short" }), today);
      break;
    case "quarter":
      topRow = group(days, yearKey, (first) => String(first.getFullYear()), today);
      bottomRow = group(days, quarterKey, (first) => `Q${QUARTER_START_MONTH(first) / 3 + 1}`, today);
      break;
  }
  // The top row never marks "today" — the bottom row and the today line already do.
  topRow = topRow.map((cell) => ({ ...cell, highlighted: false }));

  return {
    rangeStart,
    totalDays,
    dayWidth: zoom.dayWidth,
    gridWidth: totalDays * zoom.dayWidth,
    todayOffset: diffDays(today, rangeStart),
    topRow,
    bottomRow,
  };
}

/**
 * Scroll state for the chart's horizontally scrolling pane. Tracks which
 * date sits at the center of the viewport so that a zoom change (or the
 * range growing while dragging a bar past its edge) keeps that date
 * centered instead of jumping back to the left edge. Also turns
 * Ctrl/⌘ + wheel (and trackpad pinch) over the chart into zoom steps.
 */
export function useTimelineScroll(
  timeline: Timeline | null,
  zoom: { zoomIn: () => void; zoomOut: () => void },
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const centerMsRef = useRef<number | null>(null);
  const rangeStartMs = timeline?.rangeStart.getTime() ?? 0;
  const dayWidth = timeline?.dayWidth ?? 0;

  function recordCenter() {
    const el = scrollRef.current;
    if (!el || !dayWidth) return;
    centerMsRef.current = rangeStartMs + ((el.scrollLeft + el.clientWidth / 2) / dayWidth) * DAY_MS;
  }

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !dayWidth) return;
    if (centerMsRef.current === null) {
      // First layout: just remember where we are (same math as recordCenter,
      // inlined so this effect depends only on dayWidth and rangeStartMs).
      centerMsRef.current = rangeStartMs + ((el.scrollLeft + el.clientWidth / 2) / dayWidth) * DAY_MS;
      return;
    }
    el.scrollLeft = ((centerMsRef.current - rangeStartMs) / DAY_MS) * dayWidth - el.clientWidth / 2;
  }, [dayWidth, rangeStartMs]);

  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const hasTimeline = timeline !== null;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Pinch gestures arrive as many small ctrl+wheel deltas — accumulate so one gesture moves one level.
    let accumulated = 0;
    let resetTimer: ReturnType<typeof setTimeout> | undefined;
    function handleWheel(e: WheelEvent) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      accumulated += e.deltaY;
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => (accumulated = 0), 250);
      if (Math.abs(accumulated) < 40) return;
      if (accumulated < 0) zoomRef.current.zoomIn();
      else zoomRef.current.zoomOut();
      accumulated = 0;
    }
    // Non-passive so preventDefault can stop the browser's own page zoom.
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", handleWheel);
      clearTimeout(resetTimer);
    };
  }, [hasTimeline]);

  function scrollToToday() {
    const el = scrollRef.current;
    if (!el || !timeline) return;
    el.scrollTo({
      left: (timeline.todayOffset + 0.5) * timeline.dayWidth - el.clientWidth / 2,
      behavior: "smooth",
    });
  }

  return { scrollRef, onScroll: recordCenter, scrollToToday };
}

export function GanttZoomControls({
  zoom,
  onToday,
}: {
  zoom: ReturnType<typeof useGanttZoom>;
  onToday: () => void;
}) {
  const iconButton =
    "flex h-7 w-7 items-center justify-center rounded-md text-cy-gray-500 hover:bg-cy-gray-100 hover:text-cy-gray-900 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button
        type="button"
        onClick={onToday}
        className="h-7 rounded-md border border-cy-gray-200 bg-white px-2.5 text-[12px] font-medium text-cy-gray-700 hover:bg-cy-gray-025"
      >
        Today
      </button>
      <div className="flex items-center gap-0.5 rounded-md border border-cy-gray-200 bg-white p-0.5">
        <button type="button" onClick={zoom.zoomOut} disabled={!zoom.canZoomOut} aria-label="Zoom out" title="Zoom out (Ctrl/⌘ + scroll)" className={iconButton}>
          <ZoomOut size={15} strokeWidth={2} />
        </button>
        {ZOOM_LEVELS.map((level) => (
          <button
            key={level.key}
            type="button"
            onClick={() => zoom.setZoom(level.key)}
            aria-pressed={zoom.level.key === level.key}
            className={`h-7 rounded-md px-2.5 text-[12px] transition-colors duration-base ${
              zoom.level.key === level.key
                ? "bg-cy-blue-600 font-semibold text-white"
                : "text-cy-gray-500 hover:bg-cy-gray-100 hover:text-cy-gray-900"
            }`}
          >
            {level.label}
          </button>
        ))}
        <button type="button" onClick={zoom.zoomIn} disabled={!zoom.canZoomIn} aria-label="Zoom in" title="Zoom in (Ctrl/⌘ + scroll)" className={iconButton}>
          <ZoomIn size={15} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

/** The today line plus the two header rows, rendered at the top of the scrolling grid. */
export function GanttTimelineHeader({ timeline }: { timeline: Timeline }) {
  const { todayOffset, totalDays, dayWidth, topRow, bottomRow } = timeline;
  return (
    <>
      {todayOffset >= 0 && todayOffset < totalDays && (
        <div
          className="pointer-events-none absolute inset-y-0 z-20 w-0.5 bg-cy-cyan-500"
          style={{ left: todayOffset * dayWidth + dayWidth / 2 }}
        >
          <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-cy-cyan-500" />
        </div>
      )}
      <div className="flex h-[52px] shrink-0 flex-col border-b border-cy-gray-200">
        <div className="flex h-6">
          {topRow.map((cell, i) => (
            <div
              key={i}
              style={{ width: cell.days * dayWidth }}
              className="shrink-0 truncate border-r border-cy-gray-100 px-2 font-mono text-[11px] font-medium tabular-nums text-cy-gray-500"
            >
              {cell.label}
            </div>
          ))}
        </div>
        <div className="flex h-[26px]">
          {bottomRow.map((cell, i) => (
            <div
              key={i}
              style={{ width: cell.days * dayWidth }}
              className={`flex shrink-0 items-center justify-center overflow-hidden whitespace-nowrap border-r border-cy-gray-100 font-mono text-[11px] tabular-nums ${
                cell.shaded ? "bg-cy-gray-025 text-cy-gray-400" : "text-cy-gray-500"
              } ${cell.highlighted ? "font-semibold text-cy-blue-600" : ""}`}
            >
              {cell.label}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/**
 * Vertical position for a row's own bar or dot when a summary bar shares
 * its row (placement "top"): lowered so the two never overlap in the 40px
 * row. Otherwise both are centered.
 */
export const SUMMARY_STACKED_Y = "top-[27px] -translate-y-1/2";
export const CENTERED_Y = "top-1/2 -translate-y-1/2";

type SpanDates = { start: Date | null; end: Date | null };
type SpanNode = { id: string; children?: SpanNode[] };

/**
 * Earliest and latest date anywhere beneath a node (its descendants, not
 * the node itself) — what a summary bar spans for a row with no dates of
 * its own. `datesOf` lets GanttView pass its live (mid-drag) dates.
 */
export function descendantSpan<N extends SpanNode>(
  node: N,
  datesOf: (n: N) => SpanDates,
): { start: Date; end: Date } | null {
  let min: number | null = null;
  let max: number | null = null;
  const visit = (n: N) => {
    for (const child of (n.children ?? []) as N[]) {
      const { start, end } = datesOf(child);
      for (const d of [start, end]) {
        if (!d) continue;
        const t = d.getTime();
        if (min === null || t < min) min = t;
        if (max === null || t > max) max = t;
      }
      visit(child);
    }
  };
  visit(node);
  return min === null || max === null ? null : { start: new Date(min), end: new Date(max) };
}

/**
 * A rolled-up bar for a row with children: a thin dark bar with bracket
 * ends spanning everything inside, so it reads as "the span of what's
 * inside" rather than a schedulable item. Read-only — it moves when its
 * children do. `placement="top"` tucks it into the top of the row, above
 * the row's own bar or dot (see `SUMMARY_STACKED_Y`).
 */
export function SummaryBar({
  title,
  href,
  span,
  rangeStart,
  dayWidth,
  placement = "center",
}: {
  title: string;
  href: string;
  span: { start: Date; end: Date };
  rangeStart: Date;
  dayWidth: number;
  placement?: "center" | "top";
}) {
  const offset = Math.max(0, diffDays(span.start, rangeStart));
  const days = Math.max(1, diffDays(span.end, span.start) + 1);
  const left = offset * dayWidth + 2;
  const width = Math.max(days * dayWidth - 4, 8);
  const tick = "absolute top-full h-0 w-0 border-x-[4px] border-t-[5px] border-x-transparent border-t-cy-gray-600";
  return (
    <Link
      href={href}
      data-gantt-summary
      title={`${title}: ${span.start.toLocaleDateString()} – ${span.end.toLocaleDateString()} (span of the items inside)`}
      className={`absolute h-1.5 rounded-sm bg-cy-gray-600 hover:bg-cy-gray-800 ${
        placement === "top" ? "top-1" : "top-1/2 -translate-y-1/2"
      }`}
      style={{ left, width }}
    >
      <span className={`${tick} left-0`} aria-hidden />
      <span className={`${tick} right-0`} aria-hidden />
    </Link>
  );
}
