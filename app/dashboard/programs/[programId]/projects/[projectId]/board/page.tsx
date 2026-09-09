import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { ViewTabs } from "@/components/tasks/view-tabs";
import { BoardView } from "@/components/tasks/board-view";

export default async function TaskBoardPage({
  params,
}: {
  params: Promise<{ programId: string; projectId: string }>;
}) {
  const { programId, projectId } = await params;
  await requireOrgContext();

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.programId, programId)),
    with: {
      tasks: {
        with: { assignee: true },
        orderBy: (task, { desc }) => [desc(task.createdAt)],
      },
    },
  });
  if (!project) notFound();

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

      <ViewTabs basePath={basePath} active="board" />

      {project.tasks.length === 0 ? (
        <p className="text-sm text-gray-500">No tasks yet.</p>
      ) : (
        <BoardView programId={programId} projectId={projectId} initialTasks={project.tasks} />
      )}
    </div>
  );
}
