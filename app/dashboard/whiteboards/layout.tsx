import type { ReactNode } from "react";
import { requireOrgContext } from "@/lib/org";
import { getOrgWhiteboards } from "@/lib/queries";
import { formatRelativeTime } from "@/lib/whiteboard";
import { WhiteboardListPanel } from "@/components/whiteboards/whiteboard-list-panel";

/**
 * Every whiteboard page gets the board list panel beside it, so switching
 * boards never needs a detour back to the index. The negative margins undo
 * the dashboard `main`'s padding so the canvas can run edge to edge; the
 * fixed height (viewport minus the two header bars, 56px + 40px) gives the
 * canvas a definite size to fill.
 */
export default async function WhiteboardsLayout({ children }: { children: ReactNode }) {
  const ctx = await requireOrgContext();
  const boards = await getOrgWhiteboards(ctx.org.id);
  const now = new Date();

  return (
    <div className="-mx-6 -my-8 flex h-[calc(100vh-96px)] min-h-[480px]">
      <WhiteboardListPanel
        currentUserName={ctx.user.name}
        boards={boards.map((board) => ({
          id: board.id,
          name: board.name,
          updatedLabel: `${formatRelativeTime(board.updatedAt, now)}${
            board.updatedBy ? ` · ${board.updatedBy.name}` : ""
          }`,
        }))}
      />
      <div className="relative min-w-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}
