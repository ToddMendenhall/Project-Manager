import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { programs, projects, tasks } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { ViewTabs } from "@/components/views/view-tabs";
import { ItemHeader } from "@/components/views/item-header";
import { itemHeaderMeta } from "@/lib/item-header";
import { projectBreadcrumbs } from "@/lib/breadcrumbs";
import { PriorityBadge, StatusBadge } from "@/components/status-badge";
import { CalendarView } from "@/components/views/calendar-view";
import { CalendarNav } from "@/components/views/calendar-nav";
import { parseMonthParam } from "@/lib/calendar";
import { projectPath } from "@/lib/paths";

export default async function TaskCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ programId: string; projectId: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { programId, projectId } = await params;
  const sp = await searchParams;
  const ctx = await requireOrgContext();

  const program = await db.query.programs.findFirst({
    where: and(eq(programs.id, programId), eq(programs.orgId, ctx.org.id)),
    with: { portfolio: true },
  });
  if (!program) notFound();

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.programId, programId)),
  });
  if (!project) notFound();

  const { year, monthIndex0 } = parseMonthParam(sp.month);

  const [allTasks, meta] = await Promise.all([
    db.query.tasks.findMany({
      where: eq(tasks.projectId, projectId),
      columns: { id: true, title: true, dueDate: true },
      orderBy: (task, { asc }) => [asc(task.dueDate)],
    }),
    itemHeaderMeta("project", project.id),
  ]);

  const basePath = projectPath(programId, projectId);
  const items = allTasks
    .filter((t) => t.dueDate)
    .map((t) => ({ id: t.id, title: t.title, date: t.dueDate!, href: `${basePath}/tasks/${t.id}` }));
  const undated = allTasks
    .filter((t) => !t.dueDate)
    .map((t) => ({ id: t.id, title: t.title, date: new Date(), href: `${basePath}/tasks/${t.id}` }));

  return (
    <div className="flex flex-col gap-6">
      <ItemHeader
        breadcrumbs={projectBreadcrumbs(program)}
        name={project.name}
        badges={
          <>
            <StatusBadge status={project.status} />
            <PriorityBadge priority={project.priority} />
          </>
        }
        description={project.description}
        meta={meta}
        action={
          <Link href={`${basePath}/tasks/new`} className="rounded bg-cy-blue-600 px-4 py-2 text-[13px] font-semibold text-white transition-colors duration-fast hover:bg-cy-blue-700">
            New Task
          </Link>
        }
      />

      <ViewTabs basePath={basePath} active="calendar" hrefs={{ list: `${basePath}/tasks` }} />

      <CalendarNav basePath={basePath} year={year} monthIndex0={monthIndex0} />

      <CalendarView year={year} monthIndex0={monthIndex0} items={items} undated={undated} />
    </div>
  );
}
