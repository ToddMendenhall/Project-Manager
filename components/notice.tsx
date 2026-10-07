"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

/**
 * App-wide failure notices. Anything that saves optimistically or in the
 * background (inline edits, drags, quick-add, deletes) calls `showNotice`
 * when the save fails, so a rollback is never silent. `NoticeHost` (in the
 * dashboard layout) renders them. A window event keeps callers free of any
 * provider or context.
 */

const NOTICE_EVENT = "app:notice";
const DISMISS_AFTER_MS = 7000;

export function showNotice(message: string) {
  window.dispatchEvent(new CustomEvent<string>(NOTICE_EVENT, { detail: message }));
}

/** The message to show for a failed save: the generic reason plus what didn't happen. */
export const SAVE_FAILED = "Couldn't save that change, so it was undone. Check your connection and try again.";

export function NoticeHost() {
  const [notices, setNotices] = useState<{ id: number; message: string }[]>([]);
  const nextId = useRef(0);

  useEffect(() => {
    const onNotice = (e: Event) => {
      const id = nextId.current++;
      const message = (e as CustomEvent<string>).detail;
      // The same failure repeated (e.g. several edits while offline) shows once.
      setNotices((prev) => (prev.some((n) => n.message === message) ? prev : [...prev, { id, message }]));
      setTimeout(() => setNotices((prev) => prev.filter((n) => n.id !== id)), DISMISS_AFTER_MS);
    };
    window.addEventListener(NOTICE_EVENT, onNotice);
    return () => window.removeEventListener(NOTICE_EVENT, onNotice);
  }, []);

  return (
    <div aria-live="assertive" className="pointer-events-none fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-col gap-2">
      {notices.map((notice) => (
        <div
          key={notice.id}
          role="alert"
          className="pointer-events-auto flex max-w-md items-start gap-3 rounded-card border border-cy-red-300 bg-cy-red-100 px-4 py-2.5 text-sm text-cy-red-600 shadow-md"
        >
          <span className="flex-1">{notice.message}</span>
          <button
            type="button"
            onClick={() => setNotices((prev) => prev.filter((n) => n.id !== notice.id))}
            aria-label="Dismiss"
            className="shrink-0 rounded p-0.5 hover:bg-cy-red-300/40"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
