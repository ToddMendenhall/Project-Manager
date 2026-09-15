"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

type ResultRow = { id: string; title: string; path: string; href: string };
type Results = { tasks: ResultRow[]; projects: ResultRow[]; programs: ResultRow[]; members: ResultRow[] };
type FlatRow = ResultRow & { group: string };

const EMPTY_RESULTS: Results = { tasks: [], projects: [], programs: [], members: [] };
const GROUPS: { key: keyof Results; label: string }[] = [
  { key: "tasks", label: "Tasks" },
  { key: "projects", label: "Projects" },
  { key: "programs", label: "Programs" },
  { key: "members", label: "Members" },
];
const RECENTS_KEY = "command-bar-recents-v1";
const MAX_RECENTS = 5;

function loadRecents(): FlatRow[] {
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as FlatRow[]) : [];
  } catch {
    return [];
  }
}

function saveRecent(row: FlatRow) {
  try {
    const existing = loadRecents().filter((r) => r.href !== row.href);
    const next = [row, ...existing].slice(0, MAX_RECENTS);
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // Private browsing / storage disabled — recents just won't persist.
  }
}

function flatten(results: Results): FlatRow[] {
  return GROUPS.flatMap((g) => results[g.key].map((row) => ({ ...row, group: g.label })));
}

export function CommandBar() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Results>(EMPTY_RESULTS);
  const [recents, setRecents] = useState<FlatRow[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setRecents(loadRecents());
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setQuery("");
      setResults(EMPTY_RESULTS);
      setActiveIndex(0);
    }
  }, [open]);

  useEffect(() => {
    if (!query.trim()) {
      setResults(EMPTY_RESULTS);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        if (res.ok) setResults(await res.json());
      } catch {
        // Transient network error — the panel just keeps its last results.
      }
    }, 150);
    return () => clearTimeout(handle);
  }, [query]);

  const rows: FlatRow[] = query.trim() ? flatten(results) : recents;

  useEffect(() => {
    setActiveIndex(0);
  }, [rows.length, query]);

  function navigateTo(row: FlatRow) {
    saveRecent(row);
    setOpen(false);
    router.push(row.href);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[activeIndex];
      if (row) navigateTo(row);
    }
  }

  let runningIndex = -1;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded border border-white/20 bg-white/10 px-2.5 py-1.5 text-left transition-colors duration-fast hover:bg-white/15"
      >
        <Search size={15} strokeWidth={2} className="shrink-0 text-[#b3ddf4]" />
        <span className="flex-1 truncate text-[13px] text-cy-blue-200">Search tasks, projects, members</span>
        <span className="shrink-0 rounded-[2px] border border-white/20 px-1.5 font-mono text-[11px] text-cy-blue-200">
          ⌘K
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-center" style={{ paddingTop: "15vh" }}>
          <div className="fixed inset-0 backdrop-blur-[2px]" style={{ background: "rgba(16,19,23,.55)" }} onClick={() => setOpen(false)} />
          <div className="relative z-10 h-fit w-[560px] max-w-[90vw] overflow-hidden rounded-card border border-cy-gray-200 bg-white shadow-md">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search tasks, projects, members…"
              className="w-full border-0 px-4 py-3.5 text-base text-cy-gray-900 placeholder:text-cy-gray-400 focus:outline-none"
            />
            <div className="border-t border-cy-gray-100" />
            <div className="max-h-[360px] overflow-y-auto py-2">
              {rows.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-cy-gray-500">
                  {query.trim() ? "No matches" : "Type to search"}
                </p>
              ) : (
                (query.trim() ? GROUPS.map((g) => ({ label: g.label, rows: results[g.key] })) : [{ label: "Recent", rows: recents }])
                  .filter((g) => g.rows.length > 0)
                  .map((group) => (
                    <div key={group.label}>
                      <p className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-eyebrow text-cy-gray-400">
                        {group.label}
                      </p>
                      {group.rows.map((row) => {
                        runningIndex += 1;
                        const index = runningIndex;
                        const active = index === activeIndex;
                        return (
                          <button
                            key={row.id}
                            type="button"
                            onMouseEnter={() => setActiveIndex(index)}
                            onClick={() => navigateTo({ ...row, group: group.label })}
                            className={`flex h-9 w-full items-center justify-between gap-3 px-4 text-left text-sm transition-colors duration-fast ${
                              active ? "bg-cy-blue-100 text-cy-blue-800" : "text-cy-gray-900"
                            }`}
                          >
                            <span className="truncate font-medium">{row.title}</span>
                            <span className="shrink-0 truncate text-xs text-cy-gray-500">{row.path}</span>
                          </button>
                        );
                      })}
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
