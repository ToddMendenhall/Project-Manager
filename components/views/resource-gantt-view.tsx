"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, User } from "lucide-react";
import { STATUS_BAR_COLORS } from "@/components/status-badge";
import { statusLabel } from "@/lib/fields";
import { formatLocalDate, toLocalCalendarDate } from "@/lib/dates";
import type { GanttNode } from "@/lib/gantt-types";
import {
  GanttTimelineHeader,
  GanttZoomControls,
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

const INDENT_WIDTH = 16; // px per depth level

type ItemDates = { start: Date | null; end: Date | null };

function toDates(node: GanttNode): ItemDates {
  return {
    start: node.startDate ? toLocalCalendarDate(node.startDate) : null,
    end: node.endDate ? toLocalCalendarDate(node.endDate) : null,
  };
}

type Row = { node: GanttNode; depth: number; hasChildren: boolean };

function buildRows(nodes: GanttNode[], depth: number, expanded: Set<string>, out: Row[] = []): Row[] {
  for (const node of nodes) {
    const children = node.children ?? [];
    out.push({ node, depth, hasChildren: children.length > 0 });
    if (children.length > 0 && expanded.has(node.id)) {
      buildRows(children, depth + 1, expanded, out);
    }
  }
  return out;
}

/**
 * Member-rooted Gantt for the Resources view: each org member is an
 * expandable row with no bar of its own, containing the projects, tasks,
 * and subtasks assigned to them. Read-only (no drag-to-reschedule) — this
 * is a rollup of the same tasks editable from their own detail pages and
 * the other Gantt views.
 */
export function ResourceGanttView({ members }: { members: GanttNode[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(members.map((m) => m.id)));
  const zoom = useGanttZoom();
  const today = useToday();

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const rows = buildRows(members, 0, expanded);
  // Undated rows (members, always) get a summary bar spanning their work.
  const spans = new Map(
    rows.flatMap((r) => {
      // Every row with children (members, tasks with checklist items) summarizes them.
      if (!r.hasChildren) return [];
      const span = descendantSpan(r.node, toDates);
      return span ? [[r.node.id, span] as const] : [];
    }),
  );
  const allDates = [
    ...rows.flatMap((r) => {
      const d = toDates(r.node);
      return [d.start, d.end].filter((x): x is Date => !!x);
    }),
    ...[...spans.values()].flatMap((span) => [span.start, span.end]),
  ];
  const timeline = rows.length > 0 ? buildTimeline(allDates, zoom.level, today) : null;
  const scroll = useTimelineScroll(timeline, zoom);

  if (!timeline) {
    return <p className="text-sm text-cy-gray-500">No members currently have anything assigned.</p>;
  }

  const { rangeStart, dayWidth, gridWidth } = timeline;

  return (
    <div className="flex flex-col gap-2">
      <GanttZoomControls zoom={zoom} onToday={scroll.scrollToToday} />
      <div className="flex overflow-hidden rounded-card border border-cy-gray-200 bg-white">
      <div className="flex w-64 shrink-0 flex-col border-r border-cy-gray-200">
        <div className="h-[52px] shrink-0 border-b border-cy-gray-200" />
        {rows.map((row) => {
          const isMember = row.node.kind === "member";
          return (
            <div
              key={row.node.id}
              className={`flex h-10 shrink-0 items-center gap-1 border-b border-cy-gray-100 pr-3 last:border-0 ${
                isMember ? "bg-cy-gray-025" : ""
              }`}
              style={{ paddingLeft: 8 + row.depth * INDENT_WIDTH }}
            >
              {row.hasChildren ? (
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
              {isMember && (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cy-blue-100 text-cy-blue-700">
                  <User size={11} strokeWidth={2.5} />
                </span>
              )}
              {isMember ? (
                <span className="truncate text-[13px] font-semibold text-cy-gray-900" title={row.node.title}>
                  {row.node.title}
                </span>
              ) : (
                <Link
                  href={row.node.href}
                  className="truncate text-[13px] text-cy-gray-900 hover:text-cy-blue-600 hover:underline"
                  title={row.node.title}
                >
                  {row.node.title}
                </Link>
              )}
            </div>
          );
        })}
      </div>

      <div ref={scroll.scrollRef} onScroll={scroll.onScroll} className="overflow-x-auto">
        <div className="relative" style={{ width: gridWidth }}>
          <GanttTimelineHeader timeline={timeline} />

          <div className="relative">
            {rows.map((row) => {
              const { node } = row;
              const { start, end } = toDates(node);
              const barColor = STATUS_BAR_COLORS[node.status] ?? "bg-cy-gray-300";
              const isMember = node.kind === "member";
              const rowSpan = spans.get(node.id);
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
                      className={`absolute ${y} flex h-5 items-center overflow-hidden rounded-full px-2 text-[11px] font-medium text-white ${barColor}`}
                      style={{ left, width }}
                    >
                      <span className="truncate">{statusLabel(node.status)}</span>
                    </Link>
                  </div>
                );
              }

              if (start || end) {
                const point = (start ?? end)!;
                const offset = Math.max(0, diffDays(point, rangeStart));
                return (
                  <div key={node.id} className="relative h-10 border-b border-cy-gray-100 last:border-0">
                    {stackedSummary}
                    <div
                      title={`${node.title}: ${formatLocalDate(point)} (${statusLabel(node.status)})`}
                      className={`absolute ${y} h-2.5 w-2.5 rounded-full ${barColor}`}
                      style={{ left: offset * dayWidth + dayWidth / 2 - 5 }}
                    />
                  </div>
                );
              }

              return (
                <div
                  key={node.id}
                  className={`relative h-10 border-b border-cy-gray-100 last:border-0 ${isMember ? "bg-cy-gray-025" : ""}`}
                >
                  {rowSpan && (
                    <SummaryBar title={node.title} href={node.href} span={rowSpan} rangeStart={rangeStart} dayWidth={dayWidth} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}
