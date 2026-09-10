import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { projects, tasks } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { getOrgMembers } from "@/lib/queries";
import { STATUS_OPTIONS } from "@/lib/fields";
import { selectClass } from "@/components/form-controls";
import { ViewTabs } from "@/components/views/view-tabs";
import { TaskListView } from "@/components/tasks/task-list-view";

export default async function TaskListPage({
  params,
  searchParams,
}: {
  params: Promise<{ programId: string; projectId: string }>;
  searchParams: Promise<{ status?: string; assigneeId?: string }>;
}) {
  const { programId, projectId } = await params;
  const sp = await searchParams;
  const ctx = await requireOrgContext();

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.programId, programId)),
  });
  if (!project) notFound();

  const filters = [eq(tasks.projectId, projectId)];
  if (sp.status) filters.push(eq(tasks.status, sp.status as (typeof tasks.status.enumValues)[number]));
  if (sp.assigneeId === "unassigned") {
    filters.push(isNull(tasks.assigneeId));
  } else if (sp.assigneeId) {
    filters.push(eq(tasks.assigneeId, sp.assigneeId));
  }

  const [taskRows, members] = await Promise.all([
    db.query.tasks.findMany({
      where: and(...filters),
      with: {
        // Restricted to id/name — TaskListView is a Client Component, and
        // Server->Client props are serialized to the browser as-is, so an
        // unrestricted `assignee` here would ship the bcrypt hash to any
        // org member who opens this page.
        assignee: { columns: { id: true, name: true } },
        checklistItems: {
          with: { assignee: { columns: { id: true, name: true } } },
          orderBy: (item, { asc }) => [asc(item.createdAt)],
        },
      },
      orderBy: (task, { desc }) => [desc(task.createdAt)],
    }),
    getOrgMembers(ctx.org.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/dashboard/programs/${programId}/projects/${projectId}`} className="text-sm text-gray-500 underline">
          &larr; {project.name}
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Tasks</h1>
        <Link
          href={`/dashboard/programs/${programId}/projects/${projectId}/tasks/new`}
          className="rounded bg-gray-900 px-4 py-2 text-sm text-white"
        >
          New Task
        </Link>
      </div>

      <ViewTabs
        basePath={`/dashboard/programs/${programId}/projects/${projectId}`}
        active="list"
        hrefs={{ list: `/dashboard/programs/${programId}/projects/${projectId}/tasks` }}
      />

      <form method="get" className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-gray-500">Status</span>
          <select name="status" defaultValue={sp.status ?? ""} className={selectClass}>
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-gray-500">Assignee</span>
          <select name="assigneeId" defaultValue={sp.assigneeId ?? ""} className={selectClass}>
            <option value="">All assignees</option>
            <option value="unassigned">Unassigned</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded border border-gray-300 px-3 py-1.5 text-sm">
          Filter
        </button>
        {(sp.status || sp.assigneeId) && (
          <Link
            href={`/dashboard/programs/${programId}/projects/${projectId}/tasks`}
            className="text-sm text-gray-500 underline"
          >
            Clear
          </Link>
        )}
      </form>

      <TaskListView programId={programId} projectId={projectId} tasks={taskRows} orgMembers={members} />
    </div>
  );
}
