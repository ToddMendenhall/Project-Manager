import "server-only";
import type { ChecklistItem, Portfolio, Program, Project, Task } from "@/db/schema";
import type { GanttNode } from "@/lib/gantt-types";

/**
 * Maps the Portfolio -> Program -> Project -> Task -> ChecklistItem
 * hierarchy (as returned by Drizzle's nested `with`) into the generic
 * GanttNode tree the client GanttView renders. Each level's href is built
 * from its parent's, matching the app's actual route nesting (programs and
 * projects are addressed by their own id, not their portfolio's).
 */

type TaskWithChecklist = Task & { checklistItems: ChecklistItem[] };
type ProjectWithTasks = Project & { tasks: TaskWithChecklist[] };
type ProgramWithProjects = Program & { projects: ProjectWithTasks[] };
type PortfolioWithPrograms = Portfolio & { programs: ProgramWithProjects[] };

/** Earliest and latest date anywhere in these nodes and their descendants. */
function treeSpan(nodes: GanttNode[]): { start: Date; end: Date } | null {
  let min: number | null = null;
  let max: number | null = null;
  const visit = (list: GanttNode[]) => {
    for (const node of list) {
      for (const value of [node.startDate, node.endDate]) {
        if (!value) continue;
        const t = new Date(value).getTime();
        if (min === null || t < min) min = t;
        if (max === null || t > max) max = t;
      }
      if (node.children) visit(node.children);
    }
  };
  visit(nodes);
  return min === null || max === null ? null : { start: new Date(min), end: new Date(max) };
}

/**
 * The Start/End a Program's or Project's Gantt-tab header shows: its own
 * dates when set, with either missing one filled from the span of what's
 * inside it (`children`, the Gantt's rows), so the header shows a range
 * whenever there's anything to show.
 */
export function headerDates(
  own: { start: Date | null; end: Date | null },
  children: GanttNode[],
): { start: Date | null; end: Date | null } {
  if (own.start && own.end) return own;
  const span = treeSpan(children);
  return { start: own.start ?? span?.start ?? null, end: own.end ?? span?.end ?? null };
}

export function checklistItemNode(item: ChecklistItem, taskHref: string): GanttNode {
  return {
    id: item.id,
    title: item.title,
    status: item.status,
    href: `${taskHref}/checklist/${item.id}`,
    // Checklist items only ever carry a due date — no startDate column
    // exists for them, so they always render as a single dot, never a bar.
    startDate: null,
    endDate: item.dueDate,
    kind: "checklistItem",
  };
}

export function taskNode(task: TaskWithChecklist, projectHref: string): GanttNode {
  const href = `${projectHref}/tasks/${task.id}`;
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    href,
    startDate: task.startDate,
    endDate: task.dueDate,
    kind: "task",
    children: task.checklistItems.map((item) => checklistItemNode(item, href)),
  };
}

export function projectNode(project: ProjectWithTasks, programHref: string): GanttNode {
  const href = `${programHref}/projects/${project.id}`;
  return {
    id: project.id,
    title: project.name,
    status: project.status,
    href,
    startDate: project.startDate,
    endDate: project.dueDate,
    kind: "project",
    children: project.tasks.map((task) => taskNode(task, href)),
  };
}

export function programNode(program: ProgramWithProjects): GanttNode {
  const href = `/dashboard/programs/${program.id}`;
  return {
    id: program.id,
    title: program.name,
    status: program.status,
    href,
    startDate: program.startDate,
    endDate: program.targetEndDate,
    kind: "program",
    children: program.projects.map((project) => projectNode(project, href)),
  };
}

export function portfolioNode(portfolio: PortfolioWithPrograms): GanttNode {
  const href = `/dashboard/portfolios/${portfolio.id}`;
  return {
    id: portfolio.id,
    title: portfolio.name,
    status: portfolio.status,
    href,
    startDate: portfolio.startDate,
    endDate: portfolio.targetEndDate,
    kind: "portfolio",
    children: portfolio.programs.map(programNode),
  };
}
