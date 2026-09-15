"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({
  links,
  myOpenTaskCount,
}: {
  links: { href: string; label: string }[];
  myOpenTaskCount: number;
}) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-0.5 p-3">
      {links.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`flex items-center justify-between rounded px-2.5 py-1.5 text-sm font-medium transition-colors duration-fast ${
              active ? "bg-cy-blue-100 font-semibold text-cy-blue-800" : "text-cy-gray-700 hover:bg-cy-gray-050"
            }`}
          >
            <span>{link.label}</span>
            {link.href === "/dashboard/my-tasks" && myOpenTaskCount > 0 && (
              <span className="rounded-full bg-cy-blue-600 px-[7px] font-mono text-[11px] font-medium text-white">
                {myOpenTaskCount}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
