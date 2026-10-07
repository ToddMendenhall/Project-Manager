"use client";

import { useState, useTransition } from "react";
import { buttonDestructive } from "@/components/form-controls";
import { showNotice } from "@/components/notice";
import { isNextNavigationError } from "@/lib/next-errors";

export function ConfirmDeleteButton({
  action,
  confirmMessage,
  label = "Delete",
}: {
  action: () => Promise<void>;
  confirmMessage: string;
  label?: string;
}) {
  const [, startTransition] = useTransition();
  const [deleting, setDeleting] = useState(false);

  return (
    <button
      type="button"
      disabled={deleting}
      onClick={() => {
        if (!confirm(confirmMessage)) return;
        setDeleting(true);
        // Many deletes end in redirect() (that's success: Next navigates);
        // only a real failure re-enables the button and shows a notice.
        startTransition(() => {
          action().catch((err) => {
            if (isNextNavigationError(err)) return;
            setDeleting(false);
            showNotice("Couldn't delete that. It may already be gone, or you may not have permission.");
          });
        });
      }}
      className={`${buttonDestructive} px-3 py-1.5 text-xs`}
    >
      {deleting ? "Deleting..." : label}
    </button>
  );
}
