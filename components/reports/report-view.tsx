import Link from "next/link";
import { StatCard } from "@/components/stat-card";
import { BarChart } from "@/components/reports/bar-chart";
import { PriorityBadge, STATUS_BAR_COLORS, PRIORITY_BAR_COLORS } from "@/components/status-badge";
import type { ReportData, ReportTask, ProjectProgressGroup } from "@/lib/reports";

const MAX_ROWS = 15;

/**
 * The Reports view's content, shared by every hierarchy level (all
 * portfolios, one portfolio, one program, one project) — each level's page
 * fetches and flattens its own scoped tasks via lib/reports.ts's
 * buildReportData, and passes the result plus its own Project Progress
 * grouping (empty at the Project level, where there's only one project to
 * report on).
 */
export function ReportView({
  data,
  projectProgress,
}: {
  data: ReportData;
  projectProgress: ProjectProgressGroup[];
}) {
  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total Tasks" value={data.totalTasks} />
        <StatCard label="Completed" value={data.completedTasks} />
        <StatCard label="Overdue" value={data.overdueTasks.length} accent={data.overdueTasks.length > 0} />
        <StatCard label="Completion Rate" value={`${data.completionRate}%`} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-card border border-cy-gray-200 bg-white p-4">
          <h2 className="mb-4 text-sm font-semibold text-cy-gray-700">Tasks by Status</h2>
          {data.totalTasks === 0 ? (
            <p className="text-sm text-cy-gray-500">No tasks yet.</p>
          ) : (
            <BarChart
              items={data.statusCounts.map((o) => ({ ...o, colorClass: STATUS_BAR_COLORS[o.key] }))}
            />
          )}
        </div>
        <div className="rounded-card border border-cy-gray-200 bg-white p-4">
          <h2 className="mb-4 text-sm font-semibold text-cy-gray-700">Tasks by Priority</h2>
          {data.totalTasks === 0 ? (
            <p className="text-sm text-cy-gray-500">No tasks yet.</p>
          ) : (
            <BarChart
              items={data.priorityCounts.map((o) => ({ ...o, colorClass: PRIORITY_BAR_COLORS[o.key] }))}
            />
          )}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-cy-gray-900">Workload by Assignee</h2>
        {data.workload.length === 0 ? (
          <p className="text-sm text-cy-gray-500">No tasks yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-card border border-cy-gray-200 bg-white">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="border-b border-cy-gray-200 bg-cy-blue-100 text-[11px] font-semibold uppercase tracking-label text-cy-blue-800">
                <tr>
                  <th className="px-4 py-3 font-semibold">Assignee</th>
                  <th className="px-4 py-3 font-semibold">Open</th>
                  <th className="px-4 py-3 font-semibold">Overdue</th>
                  <th className="px-4 py-3 font-semibold">Completed</th>
                </tr>
              </thead>
              <tbody>
                {data.workload.map((row) => (
                  <tr key={row.name} className="border-b border-cy-gray-100 last:border-0 hover:bg-cy-gray-025">
                    <td className="px-4 py-3 font-medium text-cy-gray-900">{row.name}</td>
                    <td className="px-4 py-3 font-mono tabular-nums text-cy-gray-600">{row.open}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`font-mono tabular-nums ${row.overdue > 0 ? "font-semibold text-cy-red-500" : "text-cy-gray-600"}`}
                      >
                        {row.overdue}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums text-cy-gray-600">{row.completed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TaskTable title="Overdue" tasks={data.overdueTasks} emptyText="Nothing overdue." />
        <TaskTable title="Due in the Next 7 Days" tasks={data.dueSoonTasks} emptyText="Nothing due soon." />
      </div>

      {projectProgress.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-cy-gray-900">Project Progress</h2>
          <div className="flex flex-col gap-6">
            {projectProgress.map((group) => (
              <div key={group.id}>
                <p className="mb-2 text-sm font-medium text-cy-gray-500">{group.label}</p>
                <div className="flex flex-col gap-3">
                  {group.projects.map((project) => (
                    <Link
                      key={project.id}
                      href={project.href}
                      className="block rounded-card border border-cy-gray-100 bg-white p-4 shadow-xs transition-colors duration-fast hover:border-cy-gray-200 hover:shadow-md"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <p className="font-medium text-cy-gray-900">{project.name}</p>
                        <p className="font-mono text-xs tabular-nums text-cy-gray-400">
                          {project.completed}/{project.total} tasks complete
                        </p>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-cy-gray-050">
                        <div className="h-full rounded-full bg-cy-green-500" style={{ width: `${project.pct}%` }} />
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TaskTable({ title, tasks, emptyText }: { title: string; tasks: ReportTask[]; emptyText: string }) {
  const shown = tasks.slice(0, MAX_ROWS);

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold text-cy-gray-900">{title}</h2>
      {tasks.length === 0 ? (
        <p className="text-sm text-cy-gray-500">{emptyText}</p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-cy-gray-200 bg-white">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead className="border-b border-cy-gray-200 bg-cy-blue-100 text-[11px] font-semibold uppercase tracking-label text-cy-blue-800">
              <tr>
                <th className="px-4 py-3 font-semibold">Task</th>
                <th className="px-4 py-3 font-semibold">Priority</th>
                <th className="px-4 py-3 font-semibold">Due</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((task) => (
                <tr key={task.id} className="border-b border-cy-gray-100 last:border-0 hover:bg-cy-gray-025">
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/programs/${task.programId}/projects/${task.projectId}/tasks/${task.id}`}
                      className="font-medium text-cy-gray-900 hover:text-cy-blue-600 hover:underline"
                    >
                      {task.title}
                    </Link>
                    <p className="text-xs text-cy-gray-400">{task.projectName}</p>
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
          {tasks.length > MAX_ROWS && (
            <p className="border-t border-cy-gray-100 px-4 py-2 text-xs text-cy-gray-400">
              +{tasks.length - MAX_ROWS} more
            </p>
          )}
        </div>
      )}
    </div>
  );
}
