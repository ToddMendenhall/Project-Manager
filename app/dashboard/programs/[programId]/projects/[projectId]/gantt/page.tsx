import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { projects, tasks } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { ViewTabs } from "@/components/views/view-tabs";
import { GanttView } from "@/components/views/gantt-view";

export default async function TaskGanttPage({
  params,
}: {
  params: Promise<{ programId: string; projectId: string }>;
}) {
  const { programId, projectId } = await params;
  await requireOrgContext();

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.programId, programId)),
  });
  if (!project) notFound();

  const allTasks = await db.query.tasks.findMany({
    where: eq(tasks.projectId, projectId),
    orderBy: (task, { asc }) => [asc(task.createdAt)],
  });

  const basePath = `/dashboard/programs/${programId}/projects/${projectId}`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={basePath} className="text-sm text-gray-500 underline">
          &larr; {project.name}
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Tasks</h1>
        <Link href={`${basePath}/tasks/new`} className="rounded bg-gray-900 px-4 py-2 text-sm text-white">
          New Task
        </Link>
      </div>

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
        />
      )}
    </div>
  );
}
