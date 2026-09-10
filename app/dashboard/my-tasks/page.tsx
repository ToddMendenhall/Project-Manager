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
      <h1 className="text-xl font-semibold">My Tasks</h1>

      {myTasks.length === 0 ? (
        <p className="text-sm text-gray-500">No tasks are assigned to you.</p>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200 bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-gray-200 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Task</th>
                <th className="px-4 py-3 font-medium">Project</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Priority</th>
                <th className="px-4 py-3 font-medium">Due Date</th>
              </tr>
            </thead>
            <tbody>
              {myTasks.map((task) => (
                <tr key={task.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/programs/${task.programId}/projects/${task.projectId}/tasks/${task.id}`}
                      className="font-medium text-gray-900 hover:underline"
                    >
                      {task.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{task.projectName}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={task.status} />
                  </td>
                  <td className="px-4 py-3">
                    <PriorityBadge priority={task.priority} />
                  </td>
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
