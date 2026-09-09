"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { STATUS_OPTIONS, type StatusValue } from "@/lib/fields";
import { PriorityBadge } from "@/components/status-badge";
import { updateTaskStatus } from "@/app/dashboard/programs/[programId]/projects/[projectId]/tasks/actions";

type BoardTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: Date | string | null;
  assignee: { name: string } | null;
};

export function BoardView({
  programId,
  projectId,
  initialTasks,
}: {
  programId: string;
  projectId: string;
  initialTasks: BoardTask[];
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleDrop(newStatus: StatusValue, taskId: string) {
    setDragOverColumn(null);

    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;

    const previousStatus = task.status;
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));

    startTransition(async () => {
      try {
        await updateTaskStatus(programId, projectId, taskId, newStatus);
      } catch {
        // Revert on failure — e.g. permission or network error.
        setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: previousStatus } : t)));
      }
    });
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {STATUS_OPTIONS.map((column) => {
        const columnTasks = tasks.filter((t) => t.status === column.value);
        return (
          <div
            key={column.value}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverColumn(column.value);
            }}
            onDragLeave={() => setDragOverColumn((c) => (c === column.value ? null : c))}
            onDrop={(e) => {
              e.preventDefault();
              const taskId = e.dataTransfer.getData("text/plain");
              handleDrop(column.value, taskId);
            }}
            data-column={column.value}
            className={`flex w-64 shrink-0 flex-col gap-2 rounded border p-2 ${
              dragOverColumn === column.value
                ? "border-gray-400 bg-gray-100"
                : "border-gray-200 bg-gray-50"
            }`}
          >
            <div className="flex items-center justify-between px-1 py-1">
              <p className="text-sm font-semibold">{column.label}</p>
              <span className="text-xs text-gray-400">{columnTasks.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {columnTasks.map((task) => (
                <div
                  key={task.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", task.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  data-task-id={task.id}
                  className="cursor-grab rounded border border-gray-200 bg-white p-3 text-sm shadow-sm active:cursor-grabbing"
                >
                  <Link
                    href={`/dashboard/programs/${programId}/projects/${projectId}/tasks/${task.id}`}
                    className="font-medium text-gray-900 hover:underline"
                  >
                    {task.title}
                  </Link>
                  <div className="mt-2 flex items-center justify-between">
                    <PriorityBadge priority={task.priority} />
                    {task.assignee && (
                      <span className="text-xs text-gray-500">{task.assignee.name}</span>
                    )}
                  </div>
                  {task.dueDate && (
                    <p className="mt-1 text-xs text-gray-400">
                      Due {new Date(task.dueDate).toLocaleDateString()}
                    </p>
                  )}
                </div>
              ))}
              {columnTasks.length === 0 && (
                <p className="px-1 py-2 text-xs text-gray-400">No tasks</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
