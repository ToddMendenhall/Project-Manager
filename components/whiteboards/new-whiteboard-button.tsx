"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { buttonPrimary } from "@/components/form-controls";
import { createWhiteboard } from "@/app/dashboard/whiteboards/actions";
import { WHITEBOARD_TEMPLATES, WHITEBOARD_TEMPLATE_KEYS, type WhiteboardTemplateKey } from "@/lib/whiteboard-templates";
import { whiteboardPreview } from "@/lib/whiteboard";
import { WhiteboardPreview } from "./whiteboard-preview";

// Templates are static, so their previews are computed once per page load.
const PREVIEWS = Object.fromEntries(
  WHITEBOARD_TEMPLATE_KEYS.map((key) => [key, whiteboardPreview(WHITEBOARD_TEMPLATES[key].build())]),
) as Record<WhiteboardTemplateKey, ReturnType<typeof whiteboardPreview>>;

/**
 * "New whiteboard" button that first asks which template to start from.
 * `variant` only changes the trigger's look: the index page's primary
 * button, the list panel's full-width button, or the collapsed panel's icon.
 */
export function NewWhiteboardButton({ variant = "primary" }: { variant?: "primary" | "panel" | "icon" }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<WhiteboardTemplateKey | null>(null);
  const [, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.querySelector<HTMLButtonElement>("button[data-template]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function create(key: WhiteboardTemplateKey) {
    setPending(key);
    startTransition(async () => {
      try {
        await createWhiteboard(key);
      } finally {
        setPending(null);
      }
    });
  }

  const trigger =
    variant === "icon" ? (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="New whiteboard"
        aria-label="New whiteboard"
        className="rounded p-1.5 text-cy-blue-600 hover:bg-cy-blue-100"
      >
        <Plus size={16} />
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          variant === "panel"
            ? "flex items-center justify-center gap-1.5 rounded bg-cy-blue-600 px-3 py-1.5 text-[13px] font-semibold text-white transition-colors duration-fast hover:bg-cy-blue-700"
            : `${buttonPrimary} flex shrink-0 items-center gap-1.5`
        }
      >
        <Plus size={14} />
        New whiteboard
      </button>
    );

  return (
    <>
      {trigger}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-cy-gray-900/40 p-6"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !pending) setOpen(false);
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-whiteboard-title"
            className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-card bg-white shadow-md"
          >
            <div className="flex items-center justify-between border-b border-cy-gray-100 px-5 py-3">
              <h2 id="new-whiteboard-title" className="text-base font-semibold text-cy-gray-900">
                New whiteboard
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded p-1 text-cy-gray-500 hover:bg-cy-gray-050"
              >
                <X size={16} />
              </button>
            </div>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3 overflow-y-auto p-5">
              {WHITEBOARD_TEMPLATE_KEYS.map((key) => {
                const template = WHITEBOARD_TEMPLATES[key];
                return (
                  <li key={key}>
                    <button
                      type="button"
                      data-template={key}
                      disabled={pending !== null}
                      onClick={() => create(key)}
                      className="flex w-full flex-col overflow-hidden rounded-card border border-cy-gray-100 text-left transition-colors duration-fast hover:border-cy-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cy-cyan-500 disabled:opacity-60"
                    >
                      <div className="h-24 border-b border-cy-gray-100 bg-cy-gray-025 p-2">
                        {key === "blank" ? (
                          <div className="flex h-full items-center justify-center text-cy-gray-300">
                            <Plus size={22} />
                          </div>
                        ) : (
                          <WhiteboardPreview rects={PREVIEWS[key]} />
                        )}
                      </div>
                      <div className="px-3 py-2">
                        <p className="text-sm font-medium text-cy-gray-900">
                          {pending === key ? "Creating..." : template.name}
                        </p>
                        <p className="mt-0.5 text-xs text-cy-gray-500">{template.description}</p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
