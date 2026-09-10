"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { STATUS_OPTIONS, type StatusValue } from "@/lib/fields";

// `card` is pre-rendered server-side JSX, not a render-prop function — a
// Server Component page can pass rendered ReactNode into a Client
// Component's props, but not an arbitrary closure (Next.js RSC rule).
export type BoardItem = { id: string; status: string; sortOrder: number; card: ReactNode };

const CARD_MIME = "application/x-board-card";
const COLUMN_MIME = "application/x-board-column";

// Column order is a per-viewer display preference (which column shows
// first), not app data — every Board across every level shares the same
// fixed status set, so one localStorage key covers all of them.
const COLUMN_ORDER_STORAGE_KEY = "board-column-order-v1";

function loadColumnOrder(defaultOrder: string[]): string[] {
  try {
    const raw = window.localStorage.getItem(COLUMN_ORDER_STORAGE_KEY);
    if (!raw) return defaultOrder;
    const saved: unknown = JSON.parse(raw);
    if (!Array.isArray(saved)) return defaultOrder;
    const known = new Set(defaultOrder);
    const filtered = saved.filter((v): v is string => typeof v === "string" && known.has(v));
    const missing = defaultOrder.filter((v) => !filtered.includes(v));
    return [...filtered, ...missing];
  } catch {
    return defaultOrder;
  }
}

function saveColumnOrder(order: string[]) {
  try {
    window.localStorage.setItem(COLUMN_ORDER_STORAGE_KEY, JSON.stringify(order));
  } catch {
    // Private browsing / storage disabled — the reorder still works for
    // this render, it just won't survive a reload. Not worth surfacing.
  }
}

/** Sort-order value that lands a card at `index` among its new column's other cards (midpoint of its new neighbors). */
function sortOrderForIndex(columnItems: BoardItem[], index: number): number {
  const before = columnItems[index - 1]?.sortOrder;
  const at = columnItems[index]?.sortOrder;
  if (before === undefined && at === undefined) return Date.now();
  if (before === undefined) return at! - 1000;
  if (at === undefined) return before + 1000;
  return (before + at) / 2;
}

export function BoardView({
  items: initialItems,
  onReorder,
  readOnly = false,
}: {
  items: BoardItem[];
  onReorder?: (id: string, status: StatusValue, sortOrder: number) => Promise<void>;
  readOnly?: boolean;
}) {
  const [items, setItems] = useState(initialItems);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [dragOverCardId, setDragOverCardId] = useState<string | null>(null);
  const [columnOrder, setColumnOrder] = useState<string[]>(() => STATUS_OPTIONS.map((o) => o.value));
  const [dragOverColumnHeader, setDragOverColumnHeader] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Re-sync when the server sends fresh items (e.g. after a filter change).
  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  // Client-only: reading localStorage during the initial render would
  // mismatch the server-rendered (default-order) HTML.
  useEffect(() => {
    setColumnOrder((prev) => loadColumnOrder(prev));
  }, []);

  const draggable = !readOnly && !!onReorder;

  function handleCardDrop(targetStatus: StatusValue, droppedId: string, beforeId: string | null) {
    setDragOverColumn(null);
    setDragOverCardId(null);
    if (!draggable || !onReorder) return;

    const dragged = items.find((i) => i.id === droppedId);
    if (!dragged) return;

    const columnItems = items
      .filter((i) => i.status === targetStatus && i.id !== droppedId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const targetIndex = beforeId ? columnItems.findIndex((i) => i.id === beforeId) : columnItems.length;
    const newSortOrder = sortOrderForIndex(columnItems, targetIndex === -1 ? columnItems.length : targetIndex);

    if (dragged.status === targetStatus && dragged.sortOrder === newSortOrder) return;

    const previousStatus = dragged.status;
    const previousSortOrder = dragged.sortOrder;
    setItems((prev) =>
      prev.map((i) => (i.id === droppedId ? { ...i, status: targetStatus, sortOrder: newSortOrder } : i)),
    );

    startTransition(async () => {
      try {
        await onReorder(droppedId, targetStatus, newSortOrder);
      } catch {
        setItems((prev) =>
          prev.map((i) => (i.id === droppedId ? { ...i, status: previousStatus, sortOrder: previousSortOrder } : i)),
        );
      }
    });
  }

  function handleColumnReorder(draggedValue: string, targetValue: string) {
    setDragOverColumnHeader(null);
    if (draggedValue === targetValue) return;
    setColumnOrder((prev) => {
      const next = prev.filter((v) => v !== draggedValue);
      const targetIndex = next.indexOf(targetValue);
      next.splice(targetIndex, 0, draggedValue);
      saveColumnOrder(next);
      return next;
    });
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {columnOrder.map((columnValue) => {
        const column = STATUS_OPTIONS.find((o) => o.value === columnValue);
        if (!column) return null;
        const columnItems = items
          .filter((i) => i.status === column.value)
          .sort((a, b) => a.sortOrder - b.sortOrder);

        return (
          <div
            key={column.value}
            onDragOver={
              draggable
                ? (e) => {
                    if (!e.dataTransfer.types.includes(CARD_MIME)) return;
                    e.preventDefault();
                    setDragOverColumn(column.value);
                  }
                : undefined
            }
            onDragLeave={draggable ? () => setDragOverColumn((c) => (c === column.value ? null : c)) : undefined}
            onDrop={
              draggable
                ? (e) => {
                    if (!e.dataTransfer.types.includes(CARD_MIME)) return;
                    e.preventDefault();
                    handleCardDrop(column.value, e.dataTransfer.getData(CARD_MIME), null);
                  }
                : undefined
            }
            className={`flex w-64 shrink-0 flex-col gap-2 rounded border p-2 ${
              dragOverColumn === column.value ? "border-gray-400 bg-gray-100" : "border-gray-200 bg-gray-50"
            }`}
          >
            <div
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(COLUMN_MIME, column.value);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(COLUMN_MIME)) return;
                e.preventDefault();
                setDragOverColumnHeader(column.value);
              }}
              onDragLeave={() => setDragOverColumnHeader((c) => (c === column.value ? null : c))}
              onDrop={(e) => {
                if (!e.dataTransfer.types.includes(COLUMN_MIME)) return;
                e.preventDefault();
                handleColumnReorder(e.dataTransfer.getData(COLUMN_MIME), column.value);
              }}
              title="Drag to reorder columns"
              className={`flex cursor-grab items-center justify-between rounded px-1 py-1 active:cursor-grabbing ${
                dragOverColumnHeader === column.value ? "bg-gray-200" : ""
              }`}
            >
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
                          e.dataTransfer.setData(CARD_MIME, item.id);
                          e.dataTransfer.effectAllowed = "move";
                        }
                      : undefined
                  }
                  onDragOver={
                    draggable
                      ? (e) => {
                          if (!e.dataTransfer.types.includes(CARD_MIME)) return;
                          e.preventDefault();
                          e.stopPropagation();
                          setDragOverColumn(column.value);
                          setDragOverCardId(item.id);
                        }
                      : undefined
                  }
                  onDrop={
                    draggable
                      ? (e) => {
                          if (!e.dataTransfer.types.includes(CARD_MIME)) return;
                          e.preventDefault();
                          e.stopPropagation();
                          const droppedId = e.dataTransfer.getData(CARD_MIME);
                          if (droppedId !== item.id) handleCardDrop(column.value, droppedId, item.id);
                          setDragOverColumn(null);
                          setDragOverCardId(null);
                        }
                      : undefined
                  }
                  className={`rounded border bg-white p-3 text-sm shadow-sm ${
                    draggable ? "cursor-grab active:cursor-grabbing" : ""
                  } ${dragOverCardId === item.id ? "border-t-2 border-t-gray-900 border-x-gray-200 border-b-gray-200" : "border-gray-200"}`}
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
