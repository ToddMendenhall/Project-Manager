import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { projects, tasks } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { ViewTabs } from "@/components/views/view-tabs";
import { ItemHeader, type ItemHeaderMeta } from "@/components/views/item-header";
import { PriorityBadge, StatusBadge } from "@/components/status-badge";
import { GanttView } from "@/components/views/gantt-view";
import { updateTaskDates } from "../tasks/actions";

export default async function TaskGanttPage({
  params,
}: {
  params: Promise<{ programId: string; projectId: string }>;
}) {
  const { programId, projectId } = await params;
  await requireOrgContext();

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.programId, programId)),
    with: { lead: true },
  });
  if (!project) notFound();

  const allTasks = await db.query.tasks.findMany({
    where: eq(tasks.projectId, projectId),
    orderBy: (task, { asc }) => [asc(task.createdAt)],
  });

  const basePath = `/dashboard/programs/${programId}/projects/${projectId}`;
  const meta: ItemHeaderMeta[] = [];
  if (project.lead) meta.push({ label: "Lead", value: project.lead.name });
  if (project.startDate) meta.push({ label: "Start", value: new Date(project.startDate).toLocaleDateString() });
  if (project.dueDate) meta.push({ label: "Due", value: new Date(project.dueDate).toLocaleDateString() });

  return (
    <div className="flex flex-col gap-6">
      <ItemHeader
        backHref={basePath}
        backLabel={project.name}
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

      <ViewTabs basePath={basePath} active="gantt" hrefs={{ list: `${basePath}/tasks` }} />

      {allTasks.length === 0 ? (
        <p className="text-sm text-gray-500">No tasks yet.</p>
      ) : (
        <GanttView
          items={allTasks.map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            href: `${basePath}/tasks/${t.id}`,
            startDate: t.startDate,
            endDate: t.dueDate,
          }))}
          onDateChange={updateTaskDates.bind(null, programId, projectId)}
        />
      )}
    </div>
  );
}
