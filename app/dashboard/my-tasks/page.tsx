import Link from "next/link";
import { requireOrgContext } from "@/lib/org";
import { getOrgTasksFlat } from "@/lib/queries";
import { PriorityBadge, StatusBadge } from "@/components/status-badge";

export default async function MyTasksPage() {
  const ctx = await requireOrgContext();
  const allTasks = await getOrgTasksFlat(ctx.org.id);

  const myTasks = allTasks
    .filter((task) => task.assigneeId === ctx.user.id)
    .sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-[-0.01em] text-cy-gray-900">My Tasks</h1>

      {myTasks.length === 0 ? (
        <p className="text-sm text-cy-gray-500">No tasks are assigned to you.</p>
      ) : (
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
              {myTasks.map((task) => (
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
      )}
    </div>
  );
}
