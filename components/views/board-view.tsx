"use client";

import { useState, useTransition, type ReactNode } from "react";
import { STATUS_OPTIONS, type StatusValue } from "@/lib/fields";

// `card` is pre-rendered server-side JSX, not a render-prop function — a
// Server Component page can pass rendered ReactNode into a Client
// Component's props, but not an arbitrary closure (Next.js RSC rule).
export type BoardItem = { id: string; status: string; card: ReactNode };

export function BoardView({
  items: initialItems,
  onStatusChange,
  readOnly = false,
}: {
  items: BoardItem[];
  onStatusChange?: (id: string, status: StatusValue) => Promise<void>;
  readOnly?: boolean;
}) {
  const [items, setItems] = useState(initialItems);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const draggable = !readOnly && !!onStatusChange;

  function handleDrop(newStatus: StatusValue, id: string) {
    setDragOverColumn(null);
    if (!draggable || !onStatusChange) return;

    const item = items.find((i) => i.id === id);
    if (!item || item.status === newStatus) return;

    const previousStatus = item.status;
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: newStatus } : i)));

    startTransition(async () => {
      try {
        await onStatusChange(id, newStatus);
      } catch {
        setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: previousStatus } : i)));
      }
    });
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {STATUS_OPTIONS.map((column) => {
        const columnItems = items.filter((i) => i.status === column.value);
        return (
          <div
            key={column.value}
            onDragOver={
              draggable
                ? (e) => {
                    e.preventDefault();
                    setDragOverColumn(column.value);
                  }
                : undefined
            }
            onDragLeave={draggable ? () => setDragOverColumn((c) => (c === column.value ? null : c)) : undefined}
            onDrop={
              draggable
                ? (e) => {
                    e.preventDefault();
                    handleDrop(column.value, e.dataTransfer.getData("text/plain"));
                  }
                : undefined
            }
            className={`flex w-64 shrink-0 flex-col gap-2 rounded border p-2 ${
              dragOverColumn === column.value
                ? "border-gray-400 bg-gray-100"
                : "border-gray-200 bg-gray-50"
            }`}
          >
            <div className="flex items-center justify-between px-1 py-1">
              <p className="text-sm font-semibold">{column.label}</p>
              <span className="text-xs text-gray-400">{columnItems.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {columnItems.map((item) => (
                <div
                  key={item.id}
                  draggable={draggable}
                  onDragStart={
                    draggable
                      ? (e) => {
                          e.dataTransfer.setData("text/plain", item.id);
                          e.dataTransfer.effectAllowed = "move";
                        }
                      : undefined
                  }
                  className={`rounded border border-gray-200 bg-white p-3 text-sm shadow-sm ${
                    draggable ? "cursor-grab active:cursor-grabbing" : ""
                  }`}
                >
                  {item.card}
                </div>
              ))}
              {columnItems.length === 0 && <p className="px-1 py-2 text-xs text-gray-400">No items</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
