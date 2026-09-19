"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users } from "lucide-react";

const SECONDARY_NAV = [{ href: "/dashboard/resources", label: "Resources", icon: Users }] as const;

/**
 * A second, lighter-blue bar below the main navy header for org-wide
 * functions/views that don't belong under a single Portfolio/Program/
 * Project (e.g. the cross-org Resources Gantt) — as opposed to the
 * sidebar, which is scoped to the Portfolio/Program tree.
 */
export function SecondaryHeader() {
  const pathname = usePathname();

  return (
    <div className="flex h-10 items-center gap-1 bg-cy-blue-700 px-4">
      {SECONDARY_NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-fast ${
              active ? "bg-white/15 text-white" : "text-cy-blue-100 hover:bg-white/10 hover:text-white"
            }`}
          >
            <Icon size={14} strokeWidth={2} />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
