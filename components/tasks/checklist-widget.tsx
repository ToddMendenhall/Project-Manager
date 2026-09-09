"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PriorityBadge } from "@/components/status-badge";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import {
  createChecklistItem,
  deleteChecklistItem,
  toggleChecklistItem,
} from "@/app/dashboard/programs/[programId]/projects/[projectId]/tasks/[taskId]/checklist/actions";

type ChecklistItem = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: Date | string | null;
  assignee: { name: string } | null;
};

// A native <form action={...}> here would be a second one on the task detail
// page (the comment form is the first) — a past Next.js/React bug corrupted
// FormData when two native form actions coexisted on one page, so every
// mutation here goes through a plain function call + useTransition instead.
export function ChecklistWidget({
  programId,
  projectId,
  taskId,
  initialItems,
}: {
  programId: string;
  projectId: string;
  taskId: string;
  initialItems: ChecklistItem[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [title, setTitle] = useState("");
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // useState only takes initialItems on mount — router.refresh() re-fetches
  // this page's server data and passes new props, but that alone wouldn't
  // update this already-mounted component's local copy without this sync
  // (needed after adding/deleting an item, which changes list membership).
  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;

    setTitle("");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("title", trimmed);
      await createChecklistItem(programId, projectId, taskId, formData);
      router.refresh();
    });
    inputRef.current?.focus();
  }

  function handleToggle(item: ChecklistItem, checked: boolean) {
    const previousStatus = item.status;
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, status: checked ? "completed" : "not_started" } : i)),
    );

    startTransition(async () => {
      try {
        await toggleChecklistItem(programId, projectId, taskId, item.id, checked);
        router.refresh();
      } catch {
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: previousStatus } : i)));
      }
    });
  }

  async function handleDelete(itemId: string) {
    await deleteChecklistItem(programId, projectId, taskId, itemId);
  }

  const doneCount = items.filter((i) => i.status === "completed").length;

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">
        Checklist ({doneCount}/{items.length})
      </h2>

      {items.length === 0 ? (
        <p className="mb-3 text-sm text-gray-500">No checklist items yet.</p>
      ) : (
        <ul className="mb-3 flex flex-col gap-2">
          {items.map((item) => {
            const checked = item.status === "completed";
            return (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded border border-gray-200 bg-white p-2 text-sm"
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => handleToggle(item, e.target.checked)}
                    className="h-4 w-4"
                    aria-label={`Mark "${item.title}" complete`}
                  />
                  <Link
                    href={`/dashboard/programs/${programId}/projects/${projectId}/tasks/${taskId}/checklist/${item.id}`}
                    className={`hover:underline ${checked ? "text-gray-400 line-through" : "text-gray-900"}`}
                  >
                    {item.title}
                  </Link>
                  <PriorityBadge priority={item.priority} />
                  {item.assignee && <span className="text-xs text-gray-500">{item.assignee.name}</span>}
                  {item.dueDate && (
                    <span className="text-xs text-gray-400">
                      Due {new Date(item.dueDate).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <ConfirmDeleteButton
                  action={handleDelete.bind(null, item.id)}
                  confirmMessage={`Delete "${item.title}"?`}
                />
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={handleAdd} className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a checklist item..."
          className="w-full max-w-sm rounded border border-gray-300 px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={!title.trim()}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50"
        >
          Add
        </button>
      </form>
    </div>
  );
}
