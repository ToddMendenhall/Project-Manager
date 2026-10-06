import { notFound } from "next/navigation";
import { requireOrgContext } from "@/lib/org";
import { getWhiteboardForOrg } from "@/lib/queries";
import { canDeleteWhiteboard, parseStoredWhiteboardDoc } from "@/lib/whiteboard";
import { WhiteboardEditor } from "@/components/whiteboards/editor/whiteboard-editor";
import { deleteWhiteboard } from "../actions";

export default async function WhiteboardPage({ params }: { params: Promise<{ whiteboardId: string }> }) {
  const { whiteboardId } = await params;
  const ctx = await requireOrgContext();

  const board = await getWhiteboardForOrg(whiteboardId, ctx.org.id, { withData: true });
  if (!board) {
    notFound();
  }

  return (
    <WhiteboardEditor
      // Remount on board switch so canvas state, history and autosave never leak between boards.
      key={board.id}
      whiteboardId={board.id}
      name={board.name}
      initialDoc={parseStoredWhiteboardDoc(board.data)}
      initialVersion={board.version}
      onDelete={canDeleteWhiteboard(board, ctx) ? deleteWhiteboard.bind(null, board.id) : undefined}
    />
  );
}
