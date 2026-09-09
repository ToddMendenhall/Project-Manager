import { ConfirmDeleteButton } from "@/components/confirm-delete-button";

type CommentWithAuthor = {
  id: string;
  body: string;
  createdAt: Date;
  authorId: string;
  author: { name: string };
};

/** Renders a task's or checklist item's comment list + add-comment form. Both callers bind their own create/delete actions to the right parent id. */
export function CommentSection({
  comments,
  createAction,
  deleteAction,
  currentUserId,
  isAdmin,
}: {
  comments: CommentWithAuthor[];
  createAction: (formData: FormData) => void | Promise<void>;
  deleteAction: (commentId: string) => Promise<void>;
  currentUserId: string;
  isAdmin: boolean;
}) {
  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">Comments ({comments.length})</h2>
      {comments.length === 0 ? (
        <p className="mb-4 text-sm text-gray-500">No comments yet.</p>
      ) : (
        <ul className="mb-4 flex flex-col gap-3">
          {comments.map((comment) => (
            <li key={comment.id} className="rounded border border-gray-200 bg-white p-3 text-sm">
              <div className="flex items-center justify-between">
                <p className="font-medium text-gray-900">{comment.author.name}</p>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">{new Date(comment.createdAt).toLocaleString()}</span>
                  {(comment.authorId === currentUserId || isAdmin) && (
                    <ConfirmDeleteButton
                      action={deleteAction.bind(null, comment.id)}
                      confirmMessage="Delete this comment?"
                    />
                  )}
                </div>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-gray-600">{comment.body}</p>
            </li>
          ))}
        </ul>
      )}
      <form action={createAction} className="flex flex-col gap-2">
        <textarea
          name="body"
          required
          placeholder="Add a comment..."
          className="min-h-[80px] rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <button type="submit" className="w-fit rounded bg-gray-900 px-4 py-2 text-sm text-white">
          Comment
        </button>
      </form>
    </div>
  );
}
