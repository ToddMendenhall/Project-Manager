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
import { GanttView } from "@/components/views/gantt-view";
import { headerDates, taskNode } from "@/lib/gantt-tree";
import { updateTaskDates } from "../tasks/actions";

export default async function TaskGanttPage({
  params,
}: {
  params: Promise<{ programId: string; projectId: string }>;
}) {
  const { programId, projectId } = await params;
  const ctx = await requireOrgContext();

  const program = await db.query.programs.findFirst({
    where: and(eq(programs.id, programId), eq(programs.orgId, ctx.org.id)),
    with: { portfolio: true },
  });
  if (!program) notFound();

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.programId, programId)),
    with: { lead: { columns: { id: true, name: true } } },
  });
  if (!project) notFound();

  const allTasks = await db.query.tasks.findMany({
    where: eq(tasks.projectId, projectId),
    orderBy: (task, { asc }) => [asc(task.createdAt)],
    with: {
      checklistItems: { orderBy: (item, { asc }) => [asc(item.createdAt)] },
    },
  });

  const basePath = `/dashboard/programs/${programId}/projects/${projectId}`;
  const items = allTasks.map((t) => taskNode(t, basePath));
  const dates = headerDates({ start: project.startDate, end: project.dueDate }, items);
  const meta: ItemHeaderMeta[] = [];
  if (project.lead) meta.push({ label: "Lead", value: project.lead.name });
  if (dates.start) meta.push({ label: "Start", value: dates.start.toLocaleDateString() });
  if (dates.end) meta.push({ label: "Due", value: dates.end.toLocaleDateString() });

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

      <ViewTabs basePath={basePath} active="gantt" hrefs={{ list: `${basePath}/tasks` }} />

      {allTasks.length === 0 ? (
        <p className="text-sm text-cy-gray-500">No tasks yet.</p>
      ) : (
        <GanttView
          items={items}
          summary={{ title: project.name, href: basePath }}
          onTaskDateChange={updateTaskDates}
        />
      )}
    </div>
  );
}
