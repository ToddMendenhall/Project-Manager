import Link from "next/link";
import { STATUS_BAR_COLORS } from "@/components/status-badge";
import { statusLabel } from "@/lib/fields";

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

export function GanttView({ items }: { items: GanttItem[] }) {
  const dated = items.filter((i) => i.startDate || i.endDate);
  const undated = items.filter((i) => !i.startDate && !i.endDate);

  if (dated.length === 0) {
    return <p className="text-sm text-gray-500">No items have start or due dates yet.</p>;
  }

  const today = startOfDay(new Date());
  const allDates = dated.flatMap((i) =>
    [i.startDate, i.endDate].filter((d): d is Date | string => !!d).map((d) => startOfDay(new Date(d))),
  );
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
                const start = item.startDate ? startOfDay(new Date(item.startDate)) : null;
                const end = item.endDate ? startOfDay(new Date(item.endDate)) : null;
                const barColor = STATUS_BAR_COLORS[item.status] ?? "bg-gray-400";

                if (start && end) {
                  const offset = Math.max(0, diffDays(start, rangeStart));
                  const span = Math.max(1, diffDays(end, start) + 1);
                  return (
                    <div key={item.id} className="relative h-10 border-b border-gray-100 last:border-0">
                      <Link
                        href={item.href}
                        title={`${item.title}: ${start.toLocaleDateString()} – ${end.toLocaleDateString()} (${statusLabel(item.status)})`}
                        className={`absolute top-1/2 flex h-5 -translate-y-1/2 items-center overflow-hidden rounded-full px-2 text-[11px] font-medium text-white ${barColor}`}
                        style={{ left: offset * DAY_WIDTH + 2, width: Math.max(span * DAY_WIDTH - 4, 8) }}
                      >
                        <span className="truncate">{statusLabel(item.status)}</span>
                      </Link>
                    </div>
                  );
                }

                const point = (start ?? end)!;
                const offset = Math.max(0, diffDays(point, rangeStart));
                return (
                  <div key={item.id} className="relative h-10 border-b border-gray-100 last:border-0">
                    <div
                      title={`${item.title}: ${point.toLocaleDateString()} (${statusLabel(item.status)})`}
                      className={`absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full ${barColor}`}
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
