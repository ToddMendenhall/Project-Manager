import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { programs, projects, tasks } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { getOrgMembers } from "@/lib/queries";
import { STATUS_OPTIONS } from "@/lib/fields";
import { buttonPrimary, buttonSecondary, selectClass } from "@/components/form-controls";
import { ViewTabs } from "@/components/views/view-tabs";
import { ItemHeader } from "@/components/views/item-header";
import { itemHeaderMeta } from "@/lib/item-header";
import { projectBreadcrumbs } from "@/lib/breadcrumbs";
import { PriorityBadge, StatusBadge } from "@/components/status-badge";
import { TaskListView } from "@/components/tasks/task-list-view";
import { isUuid } from "@/lib/ids";
import { projectPath } from "@/lib/paths";

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

  const program = await db.query.programs.findFirst({
    where: and(eq(programs.id, programId), eq(programs.orgId, ctx.org.id)),
    with: { portfolio: true },
  });
  if (!program) notFound();

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.programId, programId)),
  });
  if (!project) notFound();

  const meta = await itemHeaderMeta("project", project.id);

  // Filters come from the URL, so unknown values are ignored rather than
  // sent to Postgres (where a bad enum or uuid is an error, not "no match").
  const filters = [eq(tasks.projectId, projectId)];
  const status = tasks.status.enumValues.find((v) => v === sp.status);
  if (status) filters.push(eq(tasks.status, status));
  if (sp.assigneeId === "unassigned") {
    filters.push(isNull(tasks.assigneeId));
  } else if (isUuid(sp.assigneeId)) {
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
          <Link
            href={`${projectPath(programId, projectId)}/tasks/new`}
            className={buttonPrimary}
          >
            New Task
          </Link>
        }
      />

      <ViewTabs
        basePath={projectPath(programId, projectId)}
        active="list"
        hrefs={{ list: `${projectPath(programId, projectId)}/tasks` }}
      />

      <form method="get" className="flex flex-wrap items-center gap-3">
        <select name="status" aria-label="Filter by status" defaultValue={sp.status ?? ""} className={selectClass}>
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select name="assigneeId" aria-label="Filter by assignee" defaultValue={sp.assigneeId ?? ""} className={selectClass}>
          <option value="">All assignees</option>
          <option value="unassigned">Unassigned</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <button type="submit" className={buttonSecondary}>
          Filter
        </button>
        {(sp.status || sp.assigneeId) && (
          <Link
            href={`${projectPath(programId, projectId)}/tasks`}
            className="rounded px-3 py-2 text-[13px] font-semibold text-cy-blue-600 hover:bg-cy-blue-100"
          >
            Clear
          </Link>
        )}
      </form>

      <TaskListView programId={programId} projectId={projectId} tasks={taskRows} orgMembers={members} />
    </div>
  );
}
