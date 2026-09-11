import type { ReactNode } from "react";
import Link from "next/link";
import { requireOrgContext } from "@/lib/org";
import { SignOutButton } from "@/components/sign-out-button";
import { Sidebar } from "@/components/sidebar/sidebar";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const ctx = await requireOrgContext();
  const initial = ctx.user.name.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex border-b border-gray-200 bg-white">
        <div className="flex w-64 shrink-0 items-center border-r border-gray-200 px-3 py-4">
          <Link
            href="/dashboard/account"
            className="flex items-center gap-2 rounded px-2 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white">
              {initial}
            </span>
            <span className="truncate">{ctx.user.name}</span>
          </Link>
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-between px-6 py-4">
          <div>
            <p className="font-semibold">{ctx.org.name}</p>
            <p className="text-xs text-gray-500">
              {ctx.user.name} &middot; {ctx.user.email} &middot; {ctx.role}
            </p>
          </div>
          <SignOutButton />
        </div>
      </header>
      <div className="flex flex-1">
        <Sidebar orgId={ctx.org.id} userId={ctx.user.id} isAdmin={ctx.role === "admin"} />
        <main className="min-w-0 flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
