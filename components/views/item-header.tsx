import type { ReactNode } from "react";
import Link from "next/link";

export type ItemHeaderMeta = { label: string; value: string };

export function ItemHeader({
  backHref,
  backLabel,
  name,
  badges,
  description,
  meta,
  action,
}: {
  backHref: string;
  backLabel: string;
  name: string;
  badges?: ReactNode;
  description?: string | null;
  meta?: ItemHeaderMeta[];
  action?: ReactNode;
}) {
  return (
    <>
      <div>
        <Link href={backHref} className="text-sm text-gray-500 underline">
          &larr; {backLabel}
        </Link>
      </div>
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">{name}</h1>
            {badges}
          </div>
          {description && <p className="mt-2 max-w-2xl text-sm text-gray-600">{description}</p>}
          {meta && meta.length > 0 && (
            <dl className="mt-3 flex gap-6 text-xs text-gray-500">
              {meta.map((m) => (
                <div key={m.label}>
                  <dt className="font-medium text-gray-400">{m.label}</dt>
                  <dd>{m.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        {action && <div className="flex items-center gap-4">{action}</div>}
      </div>
    </>
  );
}
