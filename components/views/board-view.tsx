"use client";

import { useEffect, useId, useState, useTransition, type KeyboardEvent, type ReactNode } from "react";
import { STATUS_OPTIONS, type StatusValue } from "@/lib/fields";
import { SAVE_FAILED, showNotice } from "@/components/notice";

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
  // Spoken after a keyboard move ("Moved to In Progress, position 2 of 3").
  const [announcement, setAnnouncement] = useState("");
  const hintId = useId();

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

  /** The other cards in a column, in display order. */
  function othersInColumn(status: string, exceptId: string) {
    return items.filter((i) => i.status === status && i.id !== exceptId).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  function handleCardDrop(targetStatus: StatusValue, droppedId: string, beforeId: string | null) {
    setDragOverColumn(null);
    setDragOverCardId(null);
    const columnItems = othersInColumn(targetStatus, droppedId);
    const targetIndex = beforeId ? columnItems.findIndex((i) => i.id === beforeId) : columnItems.length;
    moveCard(droppedId, targetStatus, targetIndex === -1 ? columnItems.length : targetIndex);
  }

  /** Moves a card to `index` among the target column's other cards and saves it. Returns whether anything changed. */
  function moveCard(droppedId: string, targetStatus: StatusValue, index: number) {
    if (!draggable || !onReorder) return false;

    const dragged = items.find((i) => i.id === droppedId);
    if (!dragged) return false;

    const newSortOrder = sortOrderForIndex(othersInColumn(targetStatus, droppedId), index);

    if (dragged.status === targetStatus && dragged.sortOrder === newSortOrder) return false;

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
        showNotice(SAVE_FAILED);
      }
    });
    return true;
  }

  /**
   * The keyboard alternative to dragging: each card is a tab stop, and while
   * the card itself has focus, ←/→ move it to the previous/next column (as
   * the viewer has them ordered) and ↑/↓ move it within its column. Enter
   * opens it (its first link). Keys pressed on a link inside the card keep
   * their usual meaning. Focus follows the card, since changing columns
   * remounts it.
   */
  function handleCardKeyDown(e: KeyboardEvent<HTMLDivElement>, item: BoardItem) {
    if (e.target !== e.currentTarget || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key === "Enter") {
      e.currentTarget.querySelector<HTMLAnchorElement>("a[href]")?.click();
      return;
    }
    const visibleColumns = columnOrder.filter((v) => STATUS_OPTIONS.some((o) => o.value === v)) as StatusValue[];
    const columnIndex = visibleColumns.indexOf(item.status as StatusValue);
    const siblings = othersInColumn(item.status, item.id);
    const position = items
      .filter((i) => i.status === item.status)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .findIndex((i) => i.id === item.id);

    let target: { status: StatusValue; index: number } | null = null;
    if (e.key === "ArrowLeft" && columnIndex > 0) {
      target = { status: visibleColumns[columnIndex - 1], index: Number.MAX_SAFE_INTEGER };
    } else if (e.key === "ArrowRight" && columnIndex >= 0 && columnIndex < visibleColumns.length - 1) {
      target = { status: visibleColumns[columnIndex + 1], index: Number.MAX_SAFE_INTEGER };
    } else if (e.key === "ArrowUp" && position > 0) {
      target = { status: item.status as StatusValue, index: position - 1 };
    } else if (e.key === "ArrowDown" && position < siblings.length) {
      target = { status: item.status as StatusValue, index: position + 1 };
    }
    if (!target) return;
    e.preventDefault();

    const targetOthers = othersInColumn(target.status, item.id);
    const index = Math.min(target.index, targetOthers.length);
    if (!moveCard(item.id, target.status, index)) return;

    const label = STATUS_OPTIONS.find((o) => o.value === target.status)?.label ?? target.status;
    setAnnouncement(`Moved to ${label}, position ${index + 1} of ${targetOthers.length + 1}`);
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-board-card="${CSS.escape(item.id)}"]`)?.focus();
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
      {draggable && (
        <>
          <p id={hintId} className="sr-only">
            Use the arrow keys to move this card between columns or up and down. Press Enter to open it.
          </p>
          <p role="status" className="sr-only">
            {announcement}
          </p>
        </>
      )}
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
            className={`flex w-64 shrink-0 flex-col gap-2 rounded-card border p-2 ${
              dragOverColumn === column.value ? "border-cy-blue-300 bg-cy-blue-100" : "border-cy-gray-200 bg-cy-gray-025"
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
              className={`flex cursor-grab items-center justify-between rounded bg-cy-blue-100 px-2 py-1.5 active:cursor-grabbing ${
                dragOverColumnHeader === column.value ? "bg-cy-blue-200" : ""
              }`}
            >
              <p className="text-[11px] font-semibold uppercase tracking-label text-cy-blue-800">{column.label}</p>
              <span className="font-mono text-xs text-cy-blue-800">{columnItems.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {columnItems.map((item) => (
                <div
                  key={item.id}
                  data-board-card={item.id}
                  tabIndex={draggable ? 0 : undefined}
                  aria-describedby={draggable ? hintId : undefined}
                  onKeyDown={draggable ? (e) => handleCardKeyDown(e, item) : undefined}
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
                  className={`rounded-card border bg-white p-3 text-sm shadow-xs transition-colors duration-fast hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cy-cyan-500 ${
                    draggable ? "cursor-grab active:cursor-grabbing" : ""
                  } ${dragOverCardId === item.id ? "border-t-2 border-t-cy-blue-600 border-x-cy-gray-200 border-b-cy-gray-200" : "border-cy-gray-200"}`}
                >
                  {item.card}
                </div>
              ))}
              {columnItems.length === 0 && <p className="px-1 py-2 text-xs text-cy-gray-400">No items</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
