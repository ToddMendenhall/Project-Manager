import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { programs, projects, tasks } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { ViewTabs } from "@/components/views/view-tabs";
import { ItemHeader, type ItemHeaderMeta } from "@/components/views/item-header";
import { projectBreadcrumbs } from "@/lib/breadcrumbs";
import { PriorityBadge, StatusBadge } from "@/components/status-badge";
import { CalendarView } from "@/components/views/calendar-view";
import { CalendarNav } from "@/components/views/calendar-nav";
import { parseMonthParam } from "@/lib/calendar";

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
    with: { lead: true },
  });
  if (!project) notFound();

  const { year, monthIndex0 } = parseMonthParam(sp.month);

  const allTasks = await db.query.tasks.findMany({
    where: eq(tasks.projectId, projectId),
    orderBy: (task, { asc }) => [asc(task.dueDate)],
  });

  const basePath = `/dashboard/programs/${programId}/projects/${projectId}`;
  const meta: ItemHeaderMeta[] = [];
  if (project.lead) meta.push({ label: "Lead", value: project.lead.name });
  if (project.startDate) meta.push({ label: "Start", value: new Date(project.startDate).toLocaleDateString() });
  if (project.dueDate) meta.push({ label: "Due", value: new Date(project.dueDate).toLocaleDateString() });
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
          <Link href={`${basePath}/tasks/new`} className="rounded bg-gray-900 px-4 py-2 text-sm text-white">
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
