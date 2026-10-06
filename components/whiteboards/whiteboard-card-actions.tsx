"use client";

import { useTransition } from "react";
import { buttonGhost } from "@/components/form-controls";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";

/** Duplicate (anyone) and Delete (creator/admin — `onDelete` is omitted otherwise) for a board card. */
export function WhiteboardCardActions({
  name,
  onDuplicate,
  onDelete,
}: {
  name: string;
  onDuplicate: () => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [isDuplicating, startDuplicate] = useTransition();

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={isDuplicating}
        onClick={() =>
          startDuplicate(() => {
            onDuplicate();
          })
        }
        className={`${buttonGhost} px-2.5 py-1.5 text-xs`}
      >
        {isDuplicating ? "Duplicating..." : "Duplicate"}
      </button>
      {onDelete && (
        <ConfirmDeleteButton action={onDelete} confirmMessage={`Delete the whiteboard "${name}"? This can't be undone.`} />
      )}
    </div>
  );
}
