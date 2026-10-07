import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { programs } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { ViewTabs } from "@/components/views/view-tabs";
import { ItemHeader } from "@/components/views/item-header";
import { itemHeaderMeta } from "@/lib/item-header";
import { programBreadcrumbs } from "@/lib/breadcrumbs";
import { StatusBadge } from "@/components/status-badge";
import { CalendarView } from "@/components/views/calendar-view";
import { CalendarNav } from "@/components/views/calendar-nav";
import { parseMonthParam } from "@/lib/calendar";

export default async function ProgramCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ programId: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { programId } = await params;
  const sp = await searchParams;
  const ctx = await requireOrgContext();

  const program = await db.query.programs.findFirst({
    where: and(eq(programs.id, programId), eq(programs.orgId, ctx.org.id)),
    with: { portfolio: true, projects: true },
  });
  if (!program) notFound();

  const { year, monthIndex0 } = parseMonthParam(sp.month);
  const basePath = `/dashboard/programs/${programId}`;
  const meta = await itemHeaderMeta("program", program.id);

  const items = program.projects
    .filter((p) => p.dueDate)
    .map((p) => ({ id: p.id, title: p.name, date: p.dueDate!, href: `${basePath}/projects/${p.id}` }));
  const undated = program.projects
    .filter((p) => !p.dueDate)
    .map((p) => ({ id: p.id, title: p.name, date: new Date(), href: `${basePath}/projects/${p.id}` }));

  return (
    <div className="flex flex-col gap-6">
      <ItemHeader
        breadcrumbs={programBreadcrumbs(program)}
        name={program.name}
        badges={<StatusBadge status={program.status} />}
        description={program.description}
        meta={meta}
        action={
          <Link href={`${basePath}/projects/new`} className="rounded bg-cy-blue-600 px-4 py-2 text-[13px] font-semibold text-white transition-colors duration-fast hover:bg-cy-blue-700">
            New Project
          </Link>
        }
      />

      <ViewTabs
        basePath={basePath}
        active="calendar"
        views={["list", "board", "calendar", "gantt", "reports"]}
        hrefs={{ list: basePath }}
      />

      <CalendarNav basePath={basePath} year={year} monthIndex0={monthIndex0} />

      <CalendarView year={year} monthIndex0={monthIndex0} items={items} undated={undated} />
    </div>
  );
}
