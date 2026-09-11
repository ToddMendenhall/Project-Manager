import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { programs } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { ViewTabs } from "@/components/views/view-tabs";
import { ItemHeader, type ItemHeaderMeta } from "@/components/views/item-header";
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
    with: { owner: true, portfolio: true, projects: true },
  });
  if (!program) notFound();

  const { year, monthIndex0 } = parseMonthParam(sp.month);
  const basePath = `/dashboard/programs/${programId}`;
  const meta: ItemHeaderMeta[] = [];
  if (program.owner) meta.push({ label: "Owner", value: program.owner.name });
  if (program.startDate) meta.push({ label: "Start", value: new Date(program.startDate).toLocaleDateString() });
  if (program.targetEndDate)
    meta.push({ label: "Target end", value: new Date(program.targetEndDate).toLocaleDateString() });

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
          ctx.role === "admin" ? (
            <Link href={`${basePath}/projects/new`} className="rounded bg-gray-900 px-4 py-2 text-sm text-white">
              New Project
            </Link>
          ) : undefined
        }
      />

      <ViewTabs
        basePath={basePath}
        active="calendar"
        views={["list", "board", "calendar", "gantt"]}
        hrefs={{ list: basePath }}
      />

      <CalendarNav basePath={basePath} year={year} monthIndex0={monthIndex0} />

      <CalendarView year={year} monthIndex0={monthIndex0} items={items} undated={undated} />
    </div>
  );
}
