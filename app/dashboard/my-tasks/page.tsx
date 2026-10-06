import Link from "next/link";
import { requireOrgContext } from "@/lib/org";
import { getAssignedTasks } from "@/lib/queries";
import { PriorityBadge, StatusBadge } from "@/components/status-badge";

type AssignedTask = Awaited<ReturnType<typeof getAssignedTasks>>["open"][number];

function TaskTable({ tasks }: { tasks: AssignedTask[] }) {
  return (
    <div className="overflow-x-auto rounded-card border border-cy-gray-200 bg-white">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-cy-gray-200 bg-cy-blue-100 text-[11px] font-semibold uppercase tracking-label text-cy-blue-800">
          <tr>
            <th className="px-4 py-3 font-semibold">Task</th>
            <th className="px-4 py-3 font-semibold">Project</th>
            <th className="px-4 py-3 font-semibold">Status</th>
            <th className="px-4 py-3 font-semibold">Priority</th>
            <th className="px-4 py-3 font-semibold">Due Date</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id} className="border-b border-cy-gray-100 last:border-0 hover:bg-cy-gray-025">
              <td className="px-4 py-3">
                <Link
                  href={`/dashboard/programs/${task.programId}/projects/${task.projectId}/tasks/${task.id}`}
                  className="font-medium text-cy-gray-900 hover:underline"
                >
                  {task.title}
                </Link>
              </td>
              <td className="px-4 py-3 text-cy-gray-600">{task.projectName}</td>
              <td className="px-4 py-3">
                <StatusBadge status={task.status} />
              </td>
              <td className="px-4 py-3">
                <PriorityBadge priority={task.priority} />
              </td>
              <td className="px-4 py-3 font-mono tabular-nums text-cy-gray-600">
                {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Open tasks shown before "Show all" — soonest due first, so the cut-off is the least urgent. */
const OPEN_LIMIT = 200;

export default async function MyTasksPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const ctx = await requireOrgContext();
  const showAll = (await searchParams).all === "1";
  const { open, moreOpen, closed, moreClosed } = await getAssignedTasks(ctx.org.id, ctx.user.id, {
    openLimit: showAll ? undefined : OPEN_LIMIT,
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-[-0.01em] text-cy-gray-900">My Tasks</h1>

      {open.length === 0 ? (
        <p className="text-sm text-cy-gray-500">
          {closed.length === 0 ? "No tasks are assigned to you." : "Nothing open — all your tasks are finished."}
        </p>
      ) : (
        <TaskTable tasks={open} />
      )}
      {moreOpen && (
        <p className="text-sm text-cy-gray-500">
          Showing your {open.length} soonest-due open tasks.{" "}
          <Link href="/dashboard/my-tasks?all=1" className="font-medium text-cy-blue-600 hover:underline">
            Show all
          </Link>
        </p>
      )}

      {closed.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer select-none text-sm font-medium text-cy-gray-600 hover:text-cy-gray-900">
            Completed &amp; cancelled ({moreClosed ? `${closed.length}+` : closed.length})
          </summary>
          <div className="mt-3 flex flex-col gap-2">
            <TaskTable tasks={closed} />
            {moreClosed && (
              <p className="text-xs text-cy-gray-500">Showing the {closed.length} most recently updated.</p>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
