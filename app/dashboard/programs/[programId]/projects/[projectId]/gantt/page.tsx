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
import { GanttView } from "@/components/views/gantt-view";
import { taskNode, GANTT_CHECKLIST_COLUMNS, GANTT_TASK_COLUMNS } from "@/lib/gantt-tree";
import { updateTaskDates } from "../tasks/actions";
import { projectPath } from "@/lib/paths";

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
  });
  if (!project) notFound();

  const allTasks = await db.query.tasks.findMany({
    columns: GANTT_TASK_COLUMNS,
    where: eq(tasks.projectId, projectId),
    orderBy: (task, { asc }) => [asc(task.createdAt)],
    with: {
      checklistItems: { columns: GANTT_CHECKLIST_COLUMNS, orderBy: (item, { asc }) => [asc(item.createdAt)] },
    },
  });

  const basePath = projectPath(programId, projectId);
  const items = allTasks.map((t) => taskNode(t, basePath));
  const meta = await itemHeaderMeta("project", project.id);

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
