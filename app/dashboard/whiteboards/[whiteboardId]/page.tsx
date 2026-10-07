import { notFound } from "next/navigation";
import { requireOrgContext } from "@/lib/org";
import { getOrgLinkTargets, getWhiteboardComments, getWhiteboardForOrg } from "@/lib/queries";
import { whiteboardLinkInfo } from "@/lib/whiteboard-links";
import { canDeleteWhiteboard, parseStoredWhiteboardDoc } from "@/lib/whiteboard";
import { WhiteboardEditor } from "@/components/whiteboards/editor/whiteboard-editor";
import { deleteWhiteboard } from "../actions";

export default async function WhiteboardPage({ params }: { params: Promise<{ whiteboardId: string }> }) {
  const { whiteboardId } = await params;
  const ctx = await requireOrgContext();

  const [board, linkTargets] = await Promise.all([
    getWhiteboardForOrg(whiteboardId, ctx.org.id, { withData: true }),
    getOrgLinkTargets(ctx.org.id),
  ]);
  if (!board) {
    notFound();
  }
  const comments = await getWhiteboardComments(board.id);

  return (
    <WhiteboardEditor
      // Remount on board switch so canvas state, history and autosave never leak between boards.
      key={board.id}
      whiteboardId={board.id}
      name={board.name}
      initialDoc={parseStoredWhiteboardDoc(board.data)}
      initialVersion={board.version}
      hasThumbnail={board.thumbnailUpdatedAt !== null}
      link={whiteboardLinkInfo(board)}
      linkTargets={linkTargets}
      onDelete={canDeleteWhiteboard(board, ctx) ? deleteWhiteboard.bind(null, board.id) : undefined}
      initialComments={comments}
      currentUserId={ctx.user.id}
      isAdmin={ctx.role === "admin"}
    />
  );
}
