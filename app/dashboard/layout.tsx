import type { ReactNode } from "react";
import Link from "next/link";
import { requireOrgContext } from "@/lib/org";
import { SignOutButton } from "@/components/sign-out-button";

const NAV_LINKS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/portfolios", label: "Portfolios" },
  { href: "/dashboard/programs", label: "Programs" },
  { href: "/dashboard/reports", label: "Reports" },
];

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const ctx = await requireOrgContext();

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center gap-8">
          <div>
            <p className="font-semibold">{ctx.org.name}</p>
            <p className="text-xs text-gray-500">
              {ctx.user.name} &middot; {ctx.user.email} &middot; {ctx.role}
            </p>
          </div>
          <nav className="flex gap-4">
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="text-sm text-gray-600 hover:text-gray-900">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <SignOutButton />
      </header>
      <main className="px-6 py-8">{children}</main>
    </div>
  );
}
