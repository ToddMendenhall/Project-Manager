import type { ReactNode } from "react";
import { requireOrgContext } from "@/lib/org";
import { AccountMenu } from "@/components/account-menu";
import { CommandBar } from "@/components/command-bar";
import { Sidebar } from "@/components/sidebar/sidebar";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const ctx = await requireOrgContext();
  const orgInitial = ctx.org.name.trim().charAt(0).toUpperCase() || "?";
  const userInitial = ctx.user.name.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 items-center gap-4 bg-cy-navy px-4">
        <div className="flex w-60 shrink-0 items-center gap-2">
          <span
            className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded text-xs font-semibold text-white"
            style={{ background: "linear-gradient(150deg,#4cccea,#1f8ed6 45%,#005a94)" }}
          >
            {orgInitial}
          </span>
          <span className="truncate text-sm font-semibold tracking-[.02em] text-white">{ctx.org.name}</span>
        </div>

        <div className="flex flex-1 justify-center">
          <div className="w-full max-w-[420px]">
            <CommandBar />
          </div>
        </div>

        <div className="flex w-60 shrink-0 items-center justify-end gap-3">
          <span className="text-xs capitalize text-cy-blue-200">{ctx.role}</span>
          <AccountMenu name={ctx.user.name} email={ctx.user.email} role={ctx.role} initial={userInitial} />
        </div>
      </header>
      <div className="flex flex-1">
        <Sidebar orgId={ctx.org.id} userId={ctx.user.id} isAdmin={ctx.role === "admin"} />
        <main className="min-w-0 flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
