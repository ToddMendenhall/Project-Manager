import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { projects, tasks } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { getOrgMembers } from "@/lib/queries";
import { PriorityBadge, StatusBadge } from "@/components/status-badge";
import { STATUS_OPTIONS, PRIORITY_OPTIONS } from "@/lib/fields";
import { selectClass } from "@/components/form-controls";

const SORTABLE_COLUMNS = {
  title: tasks.title,
  status: tasks.status,
  priority: tasks.priority,
  dueDate: tasks.dueDate,
  createdAt: tasks.createdAt,
} as const;

type SortKey = keyof typeof SORTABLE_COLUMNS;

function isSortKey(value: string | undefined): value is SortKey {
  return !!value && value in SORTABLE_COLUMNS;
}

export default async function TaskListPage({
  params,
  searchParams,
}: {
  params: Promise<{ programId: string; projectId: string }>;
  searchParams: Promise<{ status?: string; assigneeId?: string; sort?: string; dir?: string }>;
}) {
  const { programId, projectId } = await params;
  const sp = await searchParams;
  const ctx = await requireOrgContext();

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.programId, programId)),
  });
  if (!project) notFound();

  const sortKey: SortKey = isSortKey(sp.sort) ? sp.sort : "createdAt";
  const sortDir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";
  const sortFn = sortDir === "asc" ? asc : desc;

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
      with: { assignee: true },
      orderBy: [sortFn(SORTABLE_COLUMNS[sortKey])],
    }),
    getOrgMembers(ctx.org.id),
  ]);

  function sortHref(column: SortKey) {
    const nextDir = sortKey === column && sortDir === "asc" ? "desc" : "asc";
    const qs = new URLSearchParams();
    if (sp.status) qs.set("status", sp.status);
    if (sp.assigneeId) qs.set("assigneeId", sp.assigneeId);
    qs.set("sort", column);
    qs.set("dir", nextDir);
    return `?${qs.toString()}`;
  }

  function columnHeader(column: SortKey, label: string) {
    const active = sortKey === column;
    return (
      <Link href={sortHref(column)} className="flex items-center gap-1 hover:text-gray-900">
        {label}
        {active && <span className="text-gray-400">{sortDir === "asc" ? "↑" : "↓"}</span>}
      </Link>
    );
  }

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
        {sortKey !== "createdAt" && <input type="hidden" name="sort" value={sortKey} />}
        {sp.dir && <input type="hidden" name="dir" value={sortDir} />}
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

      {taskRows.length === 0 ? (
        <p className="text-sm text-gray-500">No tasks match these filters.</p>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200 bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-gray-200 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">{columnHeader("title", "Title")}</th>
                <th className="px-4 py-3 font-medium">{columnHeader("status", "Status")}</th>
                <th className="px-4 py-3 font-medium">{columnHeader("priority", "Priority")}</th>
                <th className="px-4 py-3 font-medium">Assignee</th>
                <th className="px-4 py-3 font-medium">{columnHeader("dueDate", "Due Date")}</th>
              </tr>
            </thead>
            <tbody>
              {taskRows.map((task) => (
                <tr key={task.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/programs/${programId}/projects/${projectId}/tasks/${task.id}`}
                      className="font-medium text-gray-900 hover:underline"
                    >
                      {task.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={task.status} />
                  </td>
                  <td className="px-4 py-3">
                    <PriorityBadge priority={task.priority} />
                  </td>
                  <td className="px-4 py-3 text-gray-600">{task.assignee?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
