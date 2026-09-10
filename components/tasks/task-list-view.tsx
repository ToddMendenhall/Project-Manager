"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { STATUS_OPTIONS, PRIORITY_OPTIONS, dateInputValue } from "@/lib/fields";
import { StatusBadge, STATUS_COLORS, PRIORITY_COLORS } from "@/components/status-badge";
import {
  updateTaskStatus,
  updateTaskPriority,
  updateTaskAssignee,
  updateTaskDueDate,
} from "@/app/dashboard/programs/[programId]/projects/[projectId]/tasks/actions";
import {
  updateChecklistItemStatus,
  updateChecklistItemPriority,
  updateChecklistItemAssignee,
  updateChecklistItemDueDate,
} from "@/app/dashboard/programs/[programId]/projects/[projectId]/tasks/[taskId]/checklist/actions";

type Assignee = { id: string; name: string } | null;
type OrgMember = { id: string; name: string; email: string };

type ChecklistItemRow = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: Date | string | null;
  assignee: Assignee;
};

type TaskRow = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: Date | string | null;
  assignee: Assignee;
  checklistItems: ChecklistItemRow[];
};

const ROW_GRID = "grid grid-cols-[20px_minmax(200px,1fr)_130px_160px_140px_110px] items-center gap-2";

function isOverdue(dueDate: Date | string | null, status: string) {
  if (!dueDate || status === "completed" || status === "cancelled") return false;
  return new Date(dueDate) < new Date(new Date().toDateString());
}

function StatusSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded border-0 px-2 py-1 text-xs font-medium ${STATUS_COLORS[value] ?? "bg-gray-100 text-gray-700"}`}
    >
      {STATUS_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function PrioritySelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded border-0 px-2 py-1 text-xs font-medium ${PRIORITY_COLORS[value] ?? "bg-gray-100 text-gray-700"}`}
    >
      {PRIORITY_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function AssigneeSelect({
  value,
  orgMembers,
  onChange,
}: {
  value: string;
  orgMembers: OrgMember[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600"
    >
      <option value="">Unassigned</option>
      {orgMembers.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </select>
  );
}

function DueDateInput({
  value,
  onChange,
  overdue,
}: {
  value: Date | string | null;
  onChange: (value: string) => void;
  overdue: boolean;
}) {
  return (
    <input
      type="date"
      value={dateInputValue(value)}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded border border-gray-200 bg-white px-2 py-1 text-xs ${overdue ? "text-red-600" : "text-gray-600"}`}
    />
  );
}

/** Sorts by due date ascending (undated last), then title — the grouping columns handles status. */
function sortRows<T extends { dueDate: Date | string | null; title: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (!a.dueDate && !b.dueDate) return a.title.localeCompare(b.title);
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });
}

export function TaskListView({
  programId,
  projectId,
  tasks,
  orgMembers,
}: {
  programId: string;
  projectId: string;
  tasks: TaskRow[];
  orgMembers: OrgMember[];
}) {
  const [taskList, setTaskList] = useState(tasks);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  // tasks prop changes after the filter form navigates (new search params) —
  // sync local state, same reasoning as ChecklistWidget's identical effect.
  useEffect(() => {
    setTaskList(tasks);
  }, [tasks]);

  function toggleExpanded(taskId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  function toggleGroup(status: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  function patchTask(taskId: string, patch: Partial<TaskRow>) {
    setTaskList((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...patch } : t)));
  }

  function patchItem(taskId: string, itemId: string, patch: Partial<ChecklistItemRow>) {
    setTaskList((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, checklistItems: t.checklistItems.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) }
          : t,
      ),
    );
  }

  function resolveAssignee(assigneeId: string): Assignee {
    if (!assigneeId) return null;
    const member = orgMembers.find((m) => m.id === assigneeId);
    return member ? { id: member.id, name: member.name } : null;
  }

  function handleTaskStatusChange(task: TaskRow, status: string) {
    const previous = task.status;
    patchTask(task.id, { status });
    startTransition(async () => {
      try {
        await updateTaskStatus(programId, projectId, task.id, status);
      } catch {
        patchTask(task.id, { status: previous });
      }
    });
  }

  function handleTaskPriorityChange(task: TaskRow, priority: string) {
    const previous = task.priority;
    patchTask(task.id, { priority });
    startTransition(async () => {
      try {
        await updateTaskPriority(programId, projectId, task.id, priority);
      } catch {
        patchTask(task.id, { priority: previous });
      }
    });
  }

  function handleTaskAssigneeChange(task: TaskRow, assigneeId: string) {
    const previous = task.assignee;
    patchTask(task.id, { assignee: resolveAssignee(assigneeId) });
    startTransition(async () => {
      try {
        await updateTaskAssignee(programId, projectId, task.id, assigneeId);
      } catch {
        patchTask(task.id, { assignee: previous });
      }
    });
  }

  function handleTaskDueDateChange(task: TaskRow, dueDate: string) {
    const previous = task.dueDate;
    patchTask(task.id, { dueDate: dueDate || null });
    startTransition(async () => {
      try {
        await updateTaskDueDate(programId, projectId, task.id, dueDate);
      } catch {
        patchTask(task.id, { dueDate: previous });
      }
    });
  }

  function handleItemStatusChange(task: TaskRow, item: ChecklistItemRow, status: string) {
    const previous = item.status;
    patchItem(task.id, item.id, { status });
    startTransition(async () => {
      try {
        await updateChecklistItemStatus(programId, projectId, task.id, item.id, status);
      } catch {
        patchItem(task.id, item.id, { status: previous });
      }
    });
  }

  function handleItemPriorityChange(task: TaskRow, item: ChecklistItemRow, priority: string) {
    const previous = item.priority;
    patchItem(task.id, item.id, { priority });
    startTransition(async () => {
      try {
        await updateChecklistItemPriority(programId, projectId, task.id, item.id, priority);
      } catch {
        patchItem(task.id, item.id, { priority: previous });
      }
    });
  }

  function handleItemAssigneeChange(task: TaskRow, item: ChecklistItemRow, assigneeId: string) {
    const previous = item.assignee;
    patchItem(task.id, item.id, { assignee: resolveAssignee(assigneeId) });
    startTransition(async () => {
      try {
        await updateChecklistItemAssignee(programId, projectId, task.id, item.id, assigneeId);
      } catch {
        patchItem(task.id, item.id, { assignee: previous });
      }
    });
  }

  function handleItemDueDateChange(task: TaskRow, item: ChecklistItemRow, dueDate: string) {
    const previous = item.dueDate;
    patchItem(task.id, item.id, { dueDate: dueDate || null });
    startTransition(async () => {
      try {
        await updateChecklistItemDueDate(programId, projectId, task.id, item.id, dueDate);
      } catch {
        patchItem(task.id, item.id, { dueDate: previous });
      }
    });
  }

  const groups = STATUS_OPTIONS.map((opt) => ({
    value: opt.value,
    tasks: sortRows(taskList.filter((t) => t.status === opt.value)),
  })).filter((g) => g.tasks.length > 0);

  if (groups.length === 0) {
    return <p className="text-sm text-gray-500">No tasks match these filters.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => {
        const collapsed = collapsedGroups.has(group.value);
        return (
          <div key={group.value}>
            <button
              type="button"
              onClick={() => toggleGroup(group.value)}
              className="mb-2 flex items-center gap-2"
            >
              <span className="text-xs text-gray-400">{collapsed ? "▸" : "▾"}</span>
              <StatusBadge status={group.value} />
              <span className="text-sm text-gray-400">{group.tasks.length}</span>
            </button>

            {!collapsed && (
              <div className="overflow-x-auto rounded border border-gray-200 bg-white">
                <div className="min-w-[760px]">
                  <div
                    className={`${ROW_GRID} border-b border-gray-200 px-3 py-2 text-xs font-medium uppercase text-gray-500`}
                  >
                    <span />
                    <span>Name</span>
                    <span>Status</span>
                    <span>Assignee</span>
                    <span>Due date</span>
                    <span>Priority</span>
                  </div>
                  {group.tasks.map((task) => {
                    const hasChecklist = task.checklistItems.length > 0;
                    const isExpanded = expanded.has(task.id);
                    const doneCount = task.checklistItems.filter((i) => i.status === "completed").length;

                    return (
                      <div key={task.id}>
                        <div className={`${ROW_GRID} border-b border-gray-100 px-3 py-2 text-sm last:border-0 hover:bg-gray-50`}>
                          <button
                            type="button"
                            onClick={() => hasChecklist && toggleExpanded(task.id)}
                            className={`text-xs ${hasChecklist ? "text-gray-400 hover:text-gray-700" : "text-transparent"}`}
                            aria-label={isExpanded ? "Collapse checklist" : "Expand checklist"}
                            disabled={!hasChecklist}
                          >
                            {isExpanded ? "▾" : "▸"}
                          </button>
                          <div className="flex min-w-0 items-center gap-2">
                            <Link
                              href={`/dashboard/programs/${programId}/projects/${projectId}/tasks/${task.id}`}
                              className="truncate font-medium text-gray-900 hover:underline"
                            >
                              {task.title}
                            </Link>
                            {hasChecklist && (
                              <span className="shrink-0 text-xs text-gray-400">
                                {doneCount}/{task.checklistItems.length}
                              </span>
                            )}
                          </div>
                          <StatusSelect value={task.status} onChange={(v) => handleTaskStatusChange(task, v)} />
                          <AssigneeSelect
                            value={task.assignee?.id ?? ""}
                            orgMembers={orgMembers}
                            onChange={(v) => handleTaskAssigneeChange(task, v)}
                          />
                          <DueDateInput
                            value={task.dueDate}
                            overdue={isOverdue(task.dueDate, task.status)}
                            onChange={(v) => handleTaskDueDateChange(task, v)}
                          />
                          <PrioritySelect value={task.priority} onChange={(v) => handleTaskPriorityChange(task, v)} />
                        </div>

                        {isExpanded &&
                          task.checklistItems.map((item) => (
                            <div
                              key={item.id}
                              className={`${ROW_GRID} border-b border-gray-100 bg-gray-50 px-3 py-1.5 text-sm last:border-0`}
                            >
                              <span />
                              <Link
                                href={`/dashboard/programs/${programId}/projects/${projectId}/tasks/${task.id}/checklist/${item.id}`}
                                className="truncate pl-4 text-gray-700 hover:underline"
                              >
                                {item.title}
                              </Link>
                              <StatusSelect
                                value={item.status}
                                onChange={(v) => handleItemStatusChange(task, item, v)}
                              />
                              <AssigneeSelect
                                value={item.assignee?.id ?? ""}
                                orgMembers={orgMembers}
                                onChange={(v) => handleItemAssigneeChange(task, item, v)}
                              />
                              <DueDateInput
                                value={item.dueDate}
                                overdue={isOverdue(item.dueDate, item.status)}
                                onChange={(v) => handleItemDueDateChange(task, item, v)}
                              />
                              <PrioritySelect
                                value={item.priority}
                                onChange={(v) => handleItemPriorityChange(task, item, v)}
                              />
                            </div>
                          ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
