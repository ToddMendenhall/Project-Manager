import Link from "next/link";
import { PenTool } from "lucide-react";
import { formatRelativeTime } from "@/lib/whiteboard";
import { whiteboardLinkInfo, type WhiteboardLink } from "@/lib/whiteboard-links";
import type { getLinkedWhiteboards } from "@/lib/queries";
import { NewWhiteboardButton } from "./new-whiteboard-button";

type LinkedBoard = Awaited<ReturnType<typeof getLinkedWhiteboards>>[number];

/**
 * The "Whiteboards" section on a Project or Program page: boards linked to
 * it (on a program page, also boards linked to its projects, labelled with
 * the project) and a button that creates a board already linked here.
 */
export function LinkedWhiteboards({
  boards,
  link,
  linkName,
}: {
  boards: LinkedBoard[];
  link: WhiteboardLink;
  linkName: string;
}) {
  const now = new Date();
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Whiteboards ({boards.length})</h2>
        <NewWhiteboardButton variant="small" link={link} linkName={linkName} />
      </div>
      {boards.length === 0 ? (
        <p className="text-sm text-cy-gray-500">No whiteboards linked yet.</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
          {boards.map((board) => {
            const boardLink = whiteboardLinkInfo(board);
            // On a program page, say which project a project-linked board belongs to.
            const viaProject = link.kind === "program" && boardLink?.kind === "project" ? boardLink.name : null;
            return (
              <li key={board.id}>
                <Link
                  href={`/dashboard/whiteboards/${board.id}`}
                  className="flex items-center gap-3 rounded border border-cy-gray-100 bg-white p-2 hover:border-cy-gray-400"
                >
                  <div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-cy-gray-100 bg-cy-gray-025">
                    {board.thumbnailUpdatedAt ? (
                      // eslint-disable-next-line @next/next/no-img-element -- an authenticated API route
                      <img
                        src={`/api/whiteboards/${board.id}/thumbnail?v=${board.thumbnailUpdatedAt.getTime()}`}
                        alt=""
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <PenTool size={16} className="text-cy-gray-300" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-cy-gray-900">{board.name}</p>
                    <p className="truncate text-xs text-cy-gray-400">
                      {viaProject ? `${viaProject} · ` : ""}
                      Edited {formatRelativeTime(board.updatedAt, now)}
                      {board.updatedBy && ` by ${board.updatedBy.name}`}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
