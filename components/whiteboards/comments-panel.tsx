"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { X } from "lucide-react";
import { buttonPrimary } from "@/components/form-controls";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import {
  createWhiteboardComment,
  deleteWhiteboardComment,
  listWhiteboardComments,
} from "@/app/dashboard/whiteboards/actions";
import { formatRelativeTime } from "@/lib/whiteboard";
import type { WhiteboardComment } from "@/lib/queries";

/**
 * Board-level discussion, shown beside the canvas. The editor owns the list
 * (its header shows the count); every action returns the fresh list, so
 * posting never refreshes the page and the canvas is left alone. The list is
 * re-read each time the panel opens to pick up other people's comments.
 */
export function WhiteboardCommentsPanel({
  whiteboardId,
  comments,
  onComments,
  currentUserId,
  isAdmin,
  onClose,
}: {
  whiteboardId: string;
  comments: WhiteboardComment[];
  onComments: (comments: WhiteboardComment[]) => void;
  currentUserId: string;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPosting, startPost] = useTransition();
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    let cancelled = false;
    listWhiteboardComments(whiteboardId)
      .then((fresh) => {
        if (!cancelled) onComments(fresh);
      })
      .catch(() => {
        // Keep showing what the page loaded.
      });
    return () => {
      cancelled = true;
    };
  }, [whiteboardId, onComments]);

  // Newest comments are at the bottom, next to the box they're typed in.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [comments.length]);

  function post() {
    const text = body.trim();
    if (!text || isPosting) return;
    setError(null);
    startPost(async () => {
      try {
        onComments(await createWhiteboardComment(whiteboardId, text));
        setBody("");
      } catch {
        setError("Couldn't post your comment. Try again.");
      }
    });
  }

  const now = new Date();

  return (
    <aside
      aria-label="Comments"
      className="flex w-80 shrink-0 flex-col border-l border-cy-gray-100 bg-white"
    >
      <div className="flex items-center justify-between border-b border-cy-gray-100 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-cy-gray-900">
          Comments ({comments.length})
        </h2>
        <button
          type="button"
          onClick={onClose}
          title="Close comments"
          aria-label="Close comments"
          className="rounded p-1 text-cy-gray-400 hover:bg-cy-gray-050 hover:text-cy-gray-900"
        >
          <X size={15} />
        </button>
      </div>

      {comments.length === 0 ? (
        <p className="flex-1 px-4 py-4 text-sm text-cy-gray-500">
          No comments yet. Start a discussion about this whiteboard.
        </p>
      ) : (
        <ul
          ref={listRef}
          className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3"
        >
          {comments.map((comment) => (
            <li
              key={comment.id}
              className="rounded-card border border-cy-gray-100 p-3 text-sm"
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate font-medium text-cy-gray-900">
                  {comment.author.name}
                </p>
                <time
                  dateTime={new Date(comment.createdAt).toISOString()}
                  title={new Date(comment.createdAt).toLocaleString()}
                  className="shrink-0 text-xs text-cy-gray-400"
                >
                  {formatRelativeTime(new Date(comment.createdAt), now)}
                </time>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-cy-gray-600">
                {comment.body}
              </p>
              {(comment.authorId === currentUserId || isAdmin) && (
                <div className="mt-2 flex justify-end">
                  <ConfirmDeleteButton
                    confirmMessage="Delete this comment?"
                    action={async () => {
                      try {
                        onComments(
                          await deleteWhiteboardComment(
                            whiteboardId,
                            comment.id,
                          ),
                        );
                      } catch {
                        setError("Couldn't delete that comment.");
                      }
                    }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2 border-t border-cy-gray-100 p-3">
        {error && (
          <p role="alert" className="text-xs text-cy-red-500">
            {error}
          </p>
        )}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              post();
            }
          }}
          maxLength={5000}
          placeholder="Add a comment..."
          aria-label="Add a comment"
          className="min-h-[72px] resize-y rounded border border-cy-gray-200 px-3 py-2 text-sm leading-relaxed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cy-cyan-500"
        />
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-cy-gray-400">
            Ctrl/⌘ + Enter to post
          </span>
          <button
            type="button"
            onClick={post}
            disabled={isPosting || body.trim() === ""}
            className={`${buttonPrimary} px-3 py-1.5 text-xs`}
          >
            {isPosting ? "Posting..." : "Comment"}
          </button>
        </div>
      </div>
    </aside>
  );
}
