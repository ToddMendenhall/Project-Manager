import Link from "next/link";
import { buttonSecondary } from "@/components/form-controls";

/** Shown for a dashboard URL whose item doesn't exist (or isn't in your organization). */
export default function DashboardNotFound() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-start gap-3 py-16">
      <h1 className="text-xl font-semibold text-cy-gray-900">Not found</h1>
      <p className="text-sm text-cy-gray-600">
        This item doesn&rsquo;t exist. It may have been deleted, or the link may be wrong.
      </p>
      <Link href="/dashboard" className={`${buttonSecondary} mt-2`}>
        Go to Home
      </Link>
    </div>
  );
}
