"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { LayoutGrid, PanelLeftClose, PanelLeftOpen, Plus, Search } from "lucide-react";
import { createWhiteboard } from "@/app/dashboard/whiteboards/actions";

const COLLAPSED_STORAGE_KEY = "whiteboards.listPanelCollapsed";

export type WhiteboardListItem = { id: string; name: string; updatedLabel: string };

/** The board switcher shown beside every whiteboard page (see whiteboards/layout.tsx). */
export function WhiteboardListPanel({ boards }: { boards: WhiteboardListItem[] }) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [isCreating, startCreate] = useTransition();

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === "1");
    } catch {
      // Storage unavailable (private mode etc.) — stay expanded.
    }
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(COLLAPSED_STORAGE_KEY, next ? "1" : "0");
    } catch {
      // Not persisted; the toggle still works for this page view.
    }
  }

  function newBoard() {
    startCreate(() => {
      createWhiteboard();
    });
  }

  if (collapsed) {
    return (
      <aside className="flex w-11 shrink-0 flex-col items-center gap-2 border-r border-cy-gray-100 bg-white py-3">
        <button
          type="button"
          onClick={toggleCollapsed}
          title="Show whiteboards"
          aria-label="Show whiteboards"
          className="rounded p-1.5 text-cy-gray-500 hover:bg-cy-gray-050 hover:text-cy-gray-900"
        >
          <PanelLeftOpen size={16} />
        </button>
        <button
          type="button"
          onClick={newBoard}
          disabled={isCreating}
          title="New whiteboard"
          aria-label="New whiteboard"
          className="rounded p-1.5 text-cy-blue-600 hover:bg-cy-blue-100 disabled:opacity-50"
        >
          <Plus size={16} />
        </button>
      </aside>
    );
  }

  const needle = query.trim().toLowerCase();
  const visible = needle ? boards.filter((b) => b.name.toLowerCase().includes(needle)) : boards;

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-cy-gray-100 bg-white">
      <div className="flex items-center justify-between px-3 pb-2 pt-3">
        <Link
          href="/dashboard/whiteboards"
          className={`flex items-center gap-1.5 rounded px-1.5 py-1 text-[11px] font-semibold uppercase tracking-label ${
            pathname === "/dashboard/whiteboards" ? "text-cy-blue-700" : "text-cy-gray-500 hover:text-cy-gray-900"
          }`}
        >
          <LayoutGrid size={12} />
          Whiteboards
        </Link>
        <button
          type="button"
          onClick={toggleCollapsed}
          title="Hide whiteboards"
          aria-label="Hide whiteboards"
          className="rounded p-1 text-cy-gray-400 hover:bg-cy-gray-050 hover:text-cy-gray-900"
        >
          <PanelLeftClose size={15} />
        </button>
      </div>

      <div className="flex flex-col gap-2 px-3 pb-2">
        <button
          type="button"
          onClick={newBoard}
          disabled={isCreating}
          className="flex items-center justify-center gap-1.5 rounded bg-cy-blue-600 px-3 py-1.5 text-[13px] font-semibold text-white transition-colors duration-fast hover:bg-cy-blue-700 disabled:opacity-50"
        >
          <Plus size={14} />
          {isCreating ? "Creating..." : "New whiteboard"}
        </button>
        <label className="flex items-center gap-1.5 rounded border border-cy-gray-200 px-2 py-1.5 focus-within:border-cy-blue-500">
          <Search size={13} className="shrink-0 text-cy-gray-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search whiteboards"
            aria-label="Search whiteboards"
            className="w-full bg-transparent text-[13px] text-cy-gray-900 placeholder:text-cy-gray-400 focus:outline-none"
          />
        </label>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3" aria-label="Whiteboards">
        {boards.length === 0 ? (
          <p className="px-2 py-3 text-xs text-cy-gray-500">No whiteboards yet.</p>
        ) : visible.length === 0 ? (
          <p className="px-2 py-3 text-xs text-cy-gray-500">No matches.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {visible.map((board) => {
              const href = `/dashboard/whiteboards/${board.id}`;
              const active = pathname === href;
              return (
                <li key={board.id}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded px-2.5 py-1.5 transition-colors duration-fast ${
                      active ? "bg-cy-blue-100" : "hover:bg-cy-gray-050"
                    }`}
                  >
                    <span
                      className={`block truncate text-sm ${
                        active ? "font-semibold text-cy-blue-800" : "font-medium text-cy-gray-700"
                      }`}
                    >
                      {board.name}
                    </span>
                    <span className="block truncate text-[11px] text-cy-gray-400">{board.updatedLabel}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </nav>
    </aside>
  );
}
