import "server-only";
import type { GanttNode } from "@/lib/gantt-types";

/**
 * Builds the Resources view's member -> project -> task -> subtask tree.
 * Unlike the Portfolio/Program/Project Gantt trees (lib/gantt-tree.ts), the
 * root here (a member) isn't a real dated entity — it's a grouping row with
 * no bar of its own — so this stays a separate builder rather than adding a
 * "member" branch to that one.
 */

type ResourceTask = {
  id: string;
  title: string;
  status: string;
  startDate: Date | string | null;
  dueDate: Date | string | null;
  assigneeId: string | null;
  parentTaskId: string | null;
  programId: string;
  projectId: string;
  projectName: string;
  projectStatus: string;
  projectStartDate: Date | string | null;
  projectDueDate: Date | string | null;
};

type Member = { userId: string; name: string };

function taskHref(task: ResourceTask) {
  return `/dashboard/programs/${task.programId}/projects/${task.projectId}/tasks/${task.id}`;
}

function projectHref(task: ResourceTask) {
  return `/dashboard/programs/${task.programId}/projects/${task.projectId}`;
}

/**
 * Walks a task's ancestor chain (via parentTaskId) so a subtask assigned to
 * this member still nests under its real parent task for context, even when
 * that parent is unassigned or assigned to someone else.
 */
function buildTaskNode(
  task: ResourceTask,
  taskById: Map<string, ResourceTask>,
  nodeMap: Map<string, GanttNode>,
  childIds: Set<string>,
): GanttNode {
  const existing = nodeMap.get(task.id);
  if (existing) return existing;

  const node: GanttNode = {
    id: task.id,
    title: task.title,
    status: task.status,
    href: taskHref(task),
    startDate: task.startDate,
    endDate: task.dueDate,
    kind: "task",
    children: [],
  };
  nodeMap.set(task.id, node);

  const parent = task.parentTaskId ? taskById.get(task.parentTaskId) : undefined;
  if (parent) {
    const parentNode = buildTaskNode(parent, taskById, nodeMap, childIds);
    parentNode.children!.push(node);
    childIds.add(node.id);
  }

  return node;
}

export function buildResourceTree(members: Member[], tasks: ResourceTask[]): GanttNode[] {
  const taskById = new Map(tasks.map((t) => [t.id, t]));

  return members
    .map((member): GanttNode => {
      const assigned = tasks.filter((t) => t.assigneeId === member.userId);

      const byProject = new Map<string, ResourceTask[]>();
      for (const task of assigned) {
        const list = byProject.get(task.projectId) ?? [];
        list.push(task);
        byProject.set(task.projectId, list);
      }

      const projectNodes: GanttNode[] = Array.from(byProject.entries()).map(([projectId, projectTasks]) => {
        const nodeMap = new Map<string, GanttNode>();
        const childIds = new Set<string>();
        for (const task of projectTasks) {
          buildTaskNode(task, taskById, nodeMap, childIds);
        }
        const rootTaskNodes = Array.from(nodeMap.values()).filter((n) => !childIds.has(n.id));
        const first = projectTasks[0];

        return {
          id: `${member.userId}:${projectId}`,
          title: first.projectName,
          status: first.projectStatus,
          href: projectHref(first),
          startDate: first.projectStartDate,
          endDate: first.projectDueDate,
          kind: "project",
          children: rootTaskNodes,
        };
      });

      return {
        id: member.userId,
        title: member.name,
        status: "",
        href: "#",
        startDate: null,
        endDate: null,
        kind: "member",
        children: projectNodes,
      };
    })
    .filter((memberNode) => (memberNode.children ?? []).length > 0);
}
