import Link from "next/link";
import { requireOrgContext } from "@/lib/org";
import { getOrgWhiteboards } from "@/lib/queries";
import {
  canDeleteWhiteboard,
  formatRelativeTime,
  parseStoredWhiteboardDoc,
  whiteboardPreview,
} from "@/lib/whiteboard";
import { WhiteboardPreview } from "@/components/whiteboards/whiteboard-preview";
import { WhiteboardCardActions } from "@/components/whiteboards/whiteboard-card-actions";
import { NewWhiteboardButton } from "@/components/whiteboards/new-whiteboard-button";
import { deleteWhiteboard, duplicateWhiteboard } from "./actions";

export default async function WhiteboardsPage() {
  const ctx = await requireOrgContext();
  const boards = await getOrgWhiteboards(ctx.org.id, { withData: true });
  const now = new Date();

  return (
    <div className="flex flex-col gap-6 px-6 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.01em] text-cy-gray-900">Whiteboards</h1>
          <p className="mt-1 text-sm text-cy-gray-500">
            Map processes and capture ideas on a shared canvas. Everyone in the org can open and edit a whiteboard.
          </p>
        </div>
        <NewWhiteboardButton />
      </div>

      {boards.length === 0 ? (
        <div className="rounded-card border border-dashed border-cy-gray-200 bg-white px-6 py-12 text-center">
          <p className="text-sm font-medium text-cy-gray-700">No whiteboards yet</p>
          <p className="mt-1 text-sm text-cy-gray-500">Create one to start a process map or brainstorm.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
          {boards.map((board) => {
            const href = `/dashboard/whiteboards/${board.id}`;
            const doc = parseStoredWhiteboardDoc(board.data);
            return (
              <li
                key={board.id}
                className="flex flex-col overflow-hidden rounded-card border border-cy-gray-100 bg-white hover:border-cy-gray-400"
              >
                <Link href={href} className="block">
                  <div className="h-36 border-b border-cy-gray-100 bg-cy-gray-025 p-2">
                    <WhiteboardPreview rects={whiteboardPreview(doc)} />
                  </div>
                  <div className="px-4 pb-1 pt-3">
                    <p className="truncate font-medium text-cy-gray-900">{board.name}</p>
                    <p className="mt-0.5 truncate text-xs text-cy-gray-400">
                      Edited {formatRelativeTime(board.updatedAt, now)}
                      {board.updatedBy && ` by ${board.updatedBy.name}`}
                      {` · ${doc.nodes.length} item${doc.nodes.length === 1 ? "" : "s"}`}
                    </p>
                  </div>
                </Link>
                <div className="mt-auto flex items-center justify-between px-4 pb-3 pt-2">
                  <span className="truncate text-xs text-cy-gray-500">
                    {board.createdBy ? `Created by ${board.createdBy.name}` : ""}
                  </span>
                  <WhiteboardCardActions
                    name={board.name}
                    onDuplicate={duplicateWhiteboard.bind(null, board.id)}
                    onDelete={canDeleteWhiteboard(board, ctx) ? deleteWhiteboard.bind(null, board.id) : undefined}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
