import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { programs } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { STATUS_OPTIONS, PRIORITY_OPTIONS } from "@/lib/fields";
import { StatCard } from "@/components/stat-card";
import { BarChart } from "@/components/reports/bar-chart";
import { PriorityBadge, STATUS_BAR_COLORS, PRIORITY_BAR_COLORS } from "@/components/status-badge";

const OPEN_STATUSES = new Set(["not_started", "in_progress", "blocked"]);
const MAX_ROWS = 15;

export default async function ReportsPage() {
  const ctx = await requireOrgContext();

  const orgPrograms = await db.query.programs.findMany({
    where: eq(programs.orgId, ctx.org.id),
    with: {
      projects: {
        with: {
          tasks: {
            with: { assignee: true },
          },
        },
      },
    },
    orderBy: (program, { asc }) => [asc(program.name)],
  });

  const allTasks = orgPrograms.flatMap((program) =>
    program.projects.flatMap((project) =>
      project.tasks.map((task) => ({
        ...task,
        programId: program.id,
        programName: program.name,
        projectId: project.id,
        projectName: project.name,
      })),
    ),
  );

  const now = new Date();
  const soonCutoff = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const statusCounts: Record<string, number> = Object.fromEntries(STATUS_OPTIONS.map((o) => [o.value, 0]));
  const priorityCounts: Record<string, number> = Object.fromEntries(PRIORITY_OPTIONS.map((o) => [o.value, 0]));
  for (const task of allTasks) {
    statusCounts[task.status] = (statusCounts[task.status] ?? 0) + 1;
    priorityCounts[task.priority] = (priorityCounts[task.priority] ?? 0) + 1;
  }

  const totalTasks = allTasks.length;
  const completedTasks = statusCounts.completed ?? 0;
  const activeTasks = totalTasks - (statusCounts.cancelled ?? 0);
  const completionRate = activeTasks > 0 ? Math.round((completedTasks / activeTasks) * 100) : 0;

  const overdueTasks = allTasks
    .filter((t) => t.dueDate && OPEN_STATUSES.has(t.status) && new Date(t.dueDate) < now)
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());

  const dueSoonTasks = allTasks
    .filter((t) => t.dueDate && OPEN_STATUSES.has(t.status) && new Date(t.dueDate) >= now && new Date(t.dueDate) <= soonCutoff)
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());

  const workloadByAssignee = new Map<
    string,
    { name: string; open: number; overdue: number; completed: number }
  >();
  for (const task of allTasks) {
    const key = task.assigneeId ?? "unassigned";
    const name = task.assignee?.name ?? "Unassigned";
    const entry = workloadByAssignee.get(key) ?? { name, open: 0, overdue: 0, completed: 0 };
    if (task.status === "completed") {
      entry.completed += 1;
    } else if (OPEN_STATUSES.has(task.status)) {
      entry.open += 1;
      if (task.dueDate && new Date(task.dueDate) < now) entry.overdue += 1;
    }
    workloadByAssignee.set(key, entry);
  }
  const workload = Array.from(workloadByAssignee.values()).sort((a, b) => b.open - a.open);

  const projectProgress = orgPrograms
    .map((program) => ({
      id: program.id,
      name: program.name,
      projects: program.projects.map((project) => {
        const total = project.tasks.length;
        const completed = project.tasks.filter((t) => t.status === "completed").length;
        return {
          id: project.id,
          name: project.name,
          total,
          completed,
          pct: total > 0 ? Math.round((completed / total) * 100) : 0,
        };
      }),
    }))
    .filter((program) => program.projects.length > 0);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold">Reports</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total Tasks" value={totalTasks} />
        <StatCard label="Completed" value={completedTasks} />
        <StatCard label="Overdue" value={overdueTasks.length} />
        <StatCard label="Completion Rate" value={`${completionRate}%`} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded border border-gray-200 bg-white p-4">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">Tasks by Status</h2>
          {totalTasks === 0 ? (
            <p className="text-sm text-gray-500">No tasks yet.</p>
          ) : (
            <BarChart
              items={STATUS_OPTIONS.map((o) => ({
                key: o.value,
                label: o.label,
                count: statusCounts[o.value] ?? 0,
                colorClass: STATUS_BAR_COLORS[o.value],
              }))}
            />
          )}
        </div>
        <div className="rounded border border-gray-200 bg-white p-4">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">Tasks by Priority</h2>
          {totalTasks === 0 ? (
            <p className="text-sm text-gray-500">No tasks yet.</p>
          ) : (
            <BarChart
              items={PRIORITY_OPTIONS.map((o) => ({
                key: o.value,
                label: o.label,
                count: priorityCounts[o.value] ?? 0,
                colorClass: PRIORITY_BAR_COLORS[o.value],
              }))}
            />
          )}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Workload by Assignee</h2>
        {workload.length === 0 ? (
          <p className="text-sm text-gray-500">No tasks yet.</p>
        ) : (
          <div className="overflow-x-auto rounded border border-gray-200 bg-white">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="border-b border-gray-200 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Assignee</th>
                  <th className="px-4 py-3 font-medium">Open</th>
                  <th className="px-4 py-3 font-medium">Overdue</th>
                  <th className="px-4 py-3 font-medium">Completed</th>
                </tr>
              </thead>
              <tbody>
                {workload.map((row) => (
                  <tr key={row.name} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-gray-900">{row.name}</td>
                    <td className="px-4 py-3 text-gray-600">{row.open}</td>
                    <td className="px-4 py-3">
                      <span className={row.overdue > 0 ? "font-medium text-red-600" : "text-gray-600"}>
                        {row.overdue}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{row.completed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TaskTable title="Overdue" tasks={overdueTasks} emptyText="Nothing overdue." />
        <TaskTable title="Due in the Next 7 Days" tasks={dueSoonTasks} emptyText="Nothing due soon." />
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Project Progress</h2>
        {projectProgress.length === 0 ? (
          <p className="text-sm text-gray-500">No projects yet.</p>
        ) : (
          <div className="flex flex-col gap-6">
            {projectProgress.map((program) => (
              <div key={program.id}>
                <p className="mb-2 text-sm font-medium text-gray-500">{program.name}</p>
                <div className="flex flex-col gap-3">
                  {program.projects.map((project) => (
                    <Link
                      key={project.id}
                      href={`/dashboard/programs/${program.id}/projects/${project.id}`}
                      className="block rounded border border-gray-200 bg-white p-4 hover:border-gray-400"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <p className="font-medium">{project.name}</p>
                        <p className="text-xs text-gray-400">
                          {project.completed}/{project.total} tasks complete
                        </p>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                        <div className="h-full rounded-full bg-green-500" style={{ width: `${project.pct}%` }} />
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

type ReportTask = {
  id: string;
  title: string;
  priority: string;
  dueDate: Date | null;
  programId: string;
  projectId: string;
  projectName: string;
};

function TaskTable({ title, tasks, emptyText }: { title: string; tasks: ReportTask[]; emptyText: string }) {
  const shown = tasks.slice(0, MAX_ROWS);

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {tasks.length === 0 ? (
        <p className="text-sm text-gray-500">{emptyText}</p>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200 bg-white">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead className="border-b border-gray-200 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Task</th>
                <th className="px-4 py-3 font-medium">Priority</th>
                <th className="px-4 py-3 font-medium">Due</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((task) => (
                <tr key={task.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/programs/${task.programId}/projects/${task.projectId}/tasks/${task.id}`}
                      className="font-medium text-gray-900 hover:underline"
                    >
                      {task.title}
                    </Link>
                    <p className="text-xs text-gray-400">{task.projectName}</p>
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
          {tasks.length > MAX_ROWS && (
            <p className="border-t border-gray-100 px-4 py-2 text-xs text-gray-400">
              +{tasks.length - MAX_ROWS} more
            </p>
          )}
        </div>
      )}
    </div>
  );
}
