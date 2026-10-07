"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_WIDTH_COOKIE,
  clampSidebarWidth,
} from "@/lib/sidebar";

const KEYBOARD_STEP = 16;

function saveWidth(width: number) {
  document.cookie = `${SIDEBAR_WIDTH_COOKIE}=${width}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * The dashboard sidebar's frame, with a drag handle on its right edge so
 * people can widen it to read long portfolio/program/project names.
 * - Drag to resize (clamped to SIDEBAR_MIN_WIDTH..SIDEBAR_MAX_WIDTH).
 * - Double-click the handle to fit the widest truncated label.
 * - Keyboard: focus the handle, ←/→ to resize, Home to reset.
 * The width is saved to a cookie when a gesture ends; the server reads it
 * (see Sidebar) so the next page renders at that width straight away.
 */
export function ResizableSidebar({ initialWidth, children }: { initialWidth: number; children: ReactNode }) {
  const [width, setWidth] = useState(initialWidth);
  const [dragging, setDragging] = useState(false);
  const asideRef = useRef<HTMLElement>(null);
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  const commit = (next: number) => {
    const clamped = clampSidebarWidth(next);
    setWidth(clamped);
    saveWidth(clamped);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startWidth: width };
    setDragging(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setWidth(clampSidebarWidth(drag.current.startWidth + e.clientX - drag.current.startX));
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    saveWidth(width);
  };

  // Widen just enough that no truncated label is cut off (within the max).
  const fitToContent = () => {
    const aside = asideRef.current;
    if (!aside) return;
    const overflow = Math.max(
      0,
      ...Array.from(aside.querySelectorAll<HTMLElement>(".truncate")).map((el) => el.scrollWidth - el.clientWidth),
    );
    commit(overflow > 0 ? width + overflow + 4 : width);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") commit(width - KEYBOARD_STEP);
    else if (e.key === "ArrowRight") commit(width + KEYBOARD_STEP);
    else if (e.key === "Home") commit(SIDEBAR_DEFAULT_WIDTH);
    else return;
    e.preventDefault();
  };

  return (
    <aside
      ref={asideRef}
      style={{ width }}
      className="relative flex h-full shrink-0 flex-col border-r border-cy-gray-100 bg-cy-gray-025"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        aria-valuenow={width}
        aria-valuemin={SIDEBAR_MIN_WIDTH}
        aria-valuemax={SIDEBAR_MAX_WIDTH}
        tabIndex={0}
        title="Drag to resize · double-click to fit names"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={fitToContent}
        onKeyDown={onKeyDown}
        className={`absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize touch-none select-none transition-colors duration-fast hover:bg-cy-blue-300/60 focus-visible:bg-cy-blue-300/60 focus-visible:outline-none ${
          dragging ? "bg-cy-blue-500/60" : ""
        }`}
      />
      {/* While dragging, keep the resize cursor and stop text selection everywhere. */}
      {dragging && <div className="fixed inset-0 z-50 cursor-col-resize select-none" aria-hidden />}
    </aside>
  );
}
