"use client";

import Link from "next/link";
import { useEffect } from "react";
import { buttonPrimary, buttonSecondary } from "@/components/form-controls";

/**
 * Shown in place of a dashboard page that failed to render or whose action
 * threw. The sidebar and headers stay, so the user can navigate away.
 * Production hides the error's message (it may carry internals), so this
 * only offers a retry; `digest` matches the entry in the server log.
 */
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="mx-auto flex max-w-lg flex-col items-start gap-3 py-16">
      <h1 className="text-xl font-semibold text-cy-gray-900">Something went wrong</h1>
      <p className="text-sm text-cy-gray-600">
        This page couldn&rsquo;t be loaded, or the last change didn&rsquo;t go through. Try again; if it keeps
        happening, the problem is on our side.
      </p>
      {error.digest && <p className="font-mono text-xs text-cy-gray-400">Reference: {error.digest}</p>}
      <div className="mt-2 flex gap-3">
        <button type="button" onClick={reset} className={buttonPrimary}>
          Try again
        </button>
        <Link href="/dashboard" className={buttonSecondary}>
          Go to Home
        </Link>
      </div>
    </div>
  );
}
