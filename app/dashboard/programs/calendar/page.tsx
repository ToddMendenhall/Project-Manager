import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { programs } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { ViewTabs } from "@/components/views/view-tabs";
import { ViewHeader } from "@/components/views/view-header";
import { CalendarView } from "@/components/views/calendar-view";
import { CalendarNav } from "@/components/views/calendar-nav";
import { parseMonthParam } from "@/lib/calendar";

export default async function ProgramsCalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireOrgContext();

  const orgPrograms = await db.query.programs.findMany({
    where: eq(programs.orgId, ctx.org.id),
    columns: { id: true, name: true, targetEndDate: true },
    orderBy: (program, { desc }) => [desc(program.createdAt)],
  });

  const { year, monthIndex0 } = parseMonthParam(sp.month);
  const basePath = "/dashboard/programs";

  const items = orgPrograms
    .filter((p) => p.targetEndDate)
    .map((p) => ({ id: p.id, title: p.name, date: p.targetEndDate!, href: `${basePath}/${p.id}` }));
  const undated = orgPrograms
    .filter((p) => !p.targetEndDate)
    .map((p) => ({ id: p.id, title: p.name, date: new Date(), href: `${basePath}/${p.id}` }));

  return (
    <div className="flex flex-col gap-6">
      <ViewHeader
        backHref={basePath}
        backLabel="All Programs"
        title="Programs"
        action={
          <Link href={`${basePath}/new`} className="rounded bg-cy-blue-600 px-4 py-2 text-[13px] font-semibold text-white transition-colors duration-fast hover:bg-cy-blue-700">
            New Program
          </Link>
        }
      />

      <ViewTabs
        basePath="/dashboard/programs"
        active="calendar"
        views={["list", "board", "calendar", "gantt", "reports"]}
        hrefs={{ list: "/dashboard/programs" }}
      />

      <CalendarNav basePath={basePath} year={year} monthIndex0={monthIndex0} />

      <CalendarView year={year} monthIndex0={monthIndex0} items={items} undated={undated} />
    </div>
  );
}
