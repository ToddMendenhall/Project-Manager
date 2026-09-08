"use client";

import { useTransition } from "react";

export function ConfirmDeleteButton({
  action,
  confirmMessage,
  label = "Delete",
}: {
  action: () => Promise<void>;
  confirmMessage: string;
  label?: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        if (confirm(confirmMessage)) {
          startTransition(() => {
            action();
          });
        }
      }}
      className="text-sm text-red-600 underline disabled:opacity-50"
    >
      {isPending ? "Deleting..." : label}
    </button>
  );
}
