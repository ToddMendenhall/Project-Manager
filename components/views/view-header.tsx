import type { ReactNode } from "react";
import Link from "next/link";

export function ViewHeader({
  backHref,
  backLabel,
  title,
  action,
}: {
  backHref: string;
  backLabel: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <>
      <div>
        <Link href={backHref} className="text-sm text-gray-500 underline">
          &larr; {backLabel}
        </Link>
      </div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{title}</h1>
        {action}
      </div>
    </>
  );
}
