import "server-only";
import { STATUS_OPTIONS, PRIORITY_OPTIONS } from "@/lib/fields";

const OPEN_STATUSES = new Set(["not_started", "in_progress", "blocked"]);

/**
 * The generic shape the Reports view needs from a task, regardless of which
 * hierarchy level it's being reported at (org-wide, one portfolio, one
 * program, or one project) — each level's page fetches its own scoped task
 * list and maps it to this shape before calling buildReportData.
 */
export type ReportTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: Date | string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  programId: string;
  programName: string;
  projectId: string;
  projectName: string;
};

export type ReportData = {
  totalTasks: number;
  completedTasks: number;
  completionRate: number;
  statusCounts: { key: string; label: string; count: number }[];
  priorityCounts: { key: string; label: string; count: number }[];
  overdueTasks: ReportTask[];
  dueSoonTasks: ReportTask[];
  workload: { name: string; open: number; overdue: number; completed: number }[];
};

/** One grouping level (a program, or the reported item itself) in the Project Progress section. */
export type ProjectProgressGroup = {
  id: string;
  label: string;
  projects: { id: string; href: string; name: string; total: number; completed: number; pct: number }[];
};

export function buildReportData(tasks: ReportTask[]): ReportData {
  const now = new Date();
  const soonCutoff = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const statusCountsByKey: Record<string, number> = Object.fromEntries(STATUS_OPTIONS.map((o) => [o.value, 0]));
  const priorityCountsByKey: Record<string, number> = Object.fromEntries(PRIORITY_OPTIONS.map((o) => [o.value, 0]));
  for (const task of tasks) {
    statusCountsByKey[task.status] = (statusCountsByKey[task.status] ?? 0) + 1;
    priorityCountsByKey[task.priority] = (priorityCountsByKey[task.priority] ?? 0) + 1;
  }

  const totalTasks = tasks.length;
  const completedTasks = statusCountsByKey.completed ?? 0;
  const activeTasks = totalTasks - (statusCountsByKey.cancelled ?? 0);
  const completionRate = activeTasks > 0 ? Math.round((completedTasks / activeTasks) * 100) : 0;

  const overdueTasks = tasks
    .filter((t) => t.dueDate && OPEN_STATUSES.has(t.status) && new Date(t.dueDate) < now)
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());

  const dueSoonTasks = tasks
    .filter((t) => t.dueDate && OPEN_STATUSES.has(t.status) && new Date(t.dueDate) >= now && new Date(t.dueDate) <= soonCutoff)
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());

  const workloadByAssignee = new Map<string, { name: string; open: number; overdue: number; completed: number }>();
  for (const task of tasks) {
    const key = task.assigneeId ?? "unassigned";
    const name = task.assigneeName ?? "Unassigned";
    const entry = workloadByAssignee.get(key) ?? { name, open: 0, overdue: 0, completed: 0 };
    if (task.status === "completed") {
      entry.completed += 1;
    } else if (OPEN_STATUSES.has(task.status)) {
      entry.open += 1;
      if (task.dueDate && new Date(task.dueDate) < now) entry.overdue += 1;
    }
    workloadByAssignee.set(key, entry);
  }

  return {
    totalTasks,
    completedTasks,
    completionRate,
    statusCounts: STATUS_OPTIONS.map((o) => ({ key: o.value, label: o.label, count: statusCountsByKey[o.value] ?? 0 })),
    priorityCounts: PRIORITY_OPTIONS.map((o) => ({
      key: o.value,
      label: o.label,
      count: priorityCountsByKey[o.value] ?? 0,
    })),
    overdueTasks,
    dueSoonTasks,
    workload: Array.from(workloadByAssignee.values()).sort((a, b) => b.open - a.open),
  };
}

type ProjectAgg = {
  programId: string;
  programName: string;
  projectId: string;
  projectName: string;
  total: number;
  completed: number;
};

function toProjectRow(p: ProjectAgg) {
  return {
    id: p.projectId,
    href: `/dashboard/programs/${p.programId}/projects/${p.projectId}`,
    name: p.projectName,
    total: p.total,
    completed: p.completed,
    pct: p.total > 0 ? Math.round((p.completed / p.total) * 100) : 0,
  };
}

/**
 * Groups tasks into the Reports view's Project Progress section — by
 * program when a level can span several (all portfolios, one portfolio),
 * or into a single named group when the level is already one program.
 * Projects with no tasks yet don't appear (there's nothing to derive a
 * progress bar from) — an acceptable gap for a tasks-driven report.
 */
export function groupProjectProgress(tasks: ReportTask[], singleGroupLabel?: string): ProjectProgressGroup[] {
  const byProject = new Map<string, ProjectAgg>();
  for (const t of tasks) {
    const entry = byProject.get(t.projectId) ?? {
      programId: t.programId,
      programName: t.programName,
      projectId: t.projectId,
      projectName: t.projectName,
      total: 0,
      completed: 0,
    };
    entry.total += 1;
    if (t.status === "completed") entry.completed += 1;
    byProject.set(t.projectId, entry);
  }

  const aggs = Array.from(byProject.values());
  if (singleGroupLabel) {
    return aggs.length > 0 ? [{ id: "single", label: singleGroupLabel, projects: aggs.map(toProjectRow) }] : [];
  }

  const groups = new Map<string, ProjectProgressGroup>();
  for (const p of aggs) {
    const group = groups.get(p.programId) ?? { id: p.programId, label: p.programName, projects: [] };
    group.projects.push(toProjectRow(p));
    groups.set(p.programId, group);
  }
  return Array.from(groups.values());
}
