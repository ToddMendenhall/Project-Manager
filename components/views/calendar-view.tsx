import Link from "next/link";
import { dateKey, getMonthGridDays, WEEKDAY_LABELS } from "@/lib/calendar";

export type CalendarItem = { id: string; title: string; date: Date | string; href: string };

export function CalendarView({
  year,
  monthIndex0,
  items,
  undated,
}: {
  year: number;
  monthIndex0: number;
  items: CalendarItem[];
  undated?: CalendarItem[];
}) {
  const gridDays = getMonthGridDays(year, monthIndex0);
  const byDay = new Map<string, CalendarItem[]>();
  for (const item of items) {
    const key = dateKey(new Date(item.date));
    byDay.set(key, [...(byDay.get(key) ?? []), item]);
  }
  const todayKey = dateKey(new Date());

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded border border-gray-200 bg-gray-200 text-xs">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="bg-gray-50 px-2 py-1 text-center font-medium text-gray-500">
            {label}
          </div>
        ))}
        {gridDays.map((day) => {
          const key = dateKey(day);
          const dayItems = byDay.get(key) ?? [];
          const inMonth = day.getMonth() === monthIndex0;
          const isToday = key === todayKey;

          return (
            <div
              key={key}
              className={`min-h-[100px] bg-white p-1 ${inMonth ? "" : "bg-gray-50"} ${
                isToday ? "ring-2 ring-inset ring-gray-900" : ""
              }`}
            >
              <p className={`mb-1 text-right text-xs ${inMonth ? "text-gray-600" : "text-gray-400"}`}>
                {day.getDate()}
              </p>
              <div className="flex flex-col gap-1">
                {dayItems.slice(0, 3).map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="block truncate rounded bg-gray-100 px-1 py-0.5 text-xs hover:bg-gray-200"
                    title={item.title}
                  >
                    {item.title}
                  </Link>
                ))}
                {dayItems.length > 3 && <p className="text-xs text-gray-400">+{dayItems.length - 3} more</p>}
              </div>
            </div>
          );
        })}
      </div>

      {undated && undated.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-gray-500">No date ({undated.length})</h2>
          <ul className="flex flex-col gap-1">
            {undated.map((item) => (
              <li key={item.id}>
                <Link href={item.href} className="text-sm hover:underline">
                  {item.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
