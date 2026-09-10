import Link from "next/link";
import { toMonthParam } from "@/lib/calendar";

export function CalendarNav({
  basePath,
  year,
  monthIndex0,
}: {
  basePath: string;
  year: number;
  monthIndex0: number;
}) {
  const monthLabel = new Date(year, monthIndex0, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const prevMonthParam = toMonthParam(new Date(year, monthIndex0 - 1, 1));
  const nextMonthParam = toMonthParam(new Date(year, monthIndex0 + 1, 1));

  return (
    <div className="flex items-center justify-between">
      <Link href={`${basePath}/calendar?month=${prevMonthParam}`} className="text-sm underline">
        &larr; Prev
      </Link>
      <p className="text-sm font-semibold">{monthLabel}</p>
      <Link href={`${basePath}/calendar?month=${nextMonthParam}`} className="text-sm underline">
        Next &rarr;
      </Link>
    </div>
  );
}
