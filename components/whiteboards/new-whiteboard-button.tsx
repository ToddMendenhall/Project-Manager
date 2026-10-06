"use client";

import { useTransition } from "react";
import { Plus } from "lucide-react";
import { buttonPrimary } from "@/components/form-controls";
import { createWhiteboard } from "@/app/dashboard/whiteboards/actions";

export function NewWhiteboardButton() {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(() => {
          createWhiteboard();
        })
      }
      className={`${buttonPrimary} flex shrink-0 items-center gap-1.5`}
    >
      <Plus size={14} />
      {isPending ? "Creating..." : "New whiteboard"}
    </button>
  );
}
