import type { ReactNode } from "react";
import { Breadcrumbs, type Crumb } from "./breadcrumbs";

export type ItemHeaderMeta = { label: string; value: string; mono?: boolean };

export function ItemHeader({
  breadcrumbs,
  name,
  badges,
  description,
  meta,
  action,
}: {
  breadcrumbs: Crumb[];
  name: string;
  badges?: ReactNode;
  description?: string | null;
  meta?: ItemHeaderMeta[];
  action?: ReactNode;
}) {
  return (
    <>
      <Breadcrumbs items={breadcrumbs} />
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-[-0.01em] text-cy-gray-900">{name}</h1>
            {badges}
          </div>
          {description && (
            <p className="mt-2 max-w-[660px] text-sm leading-relaxed text-cy-gray-600">{description}</p>
          )}
          {meta && meta.length > 0 && (
            <dl className="mt-3.5 flex gap-7">
              {meta.map((m) => (
                <div key={m.label}>
                  <dt className="text-[11px] font-semibold uppercase tracking-label text-cy-gray-400">{m.label}</dt>
                  <dd
                    className={`mt-[3px] text-[13px] font-medium text-cy-gray-700 ${m.mono ? "font-mono tabular-nums" : ""}`}
                  >
                    {m.value}
                  </dd>
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
