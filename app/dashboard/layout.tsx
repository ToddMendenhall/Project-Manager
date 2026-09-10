import type { ReactNode } from "react";
import { requireOrgContext } from "@/lib/org";
import { SignOutButton } from "@/components/sign-out-button";
import { Sidebar } from "@/components/sidebar/sidebar";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const ctx = await requireOrgContext();

  return (
    <div className="flex min-h-screen">
      <Sidebar orgId={ctx.org.id} userId={ctx.user.id} isAdmin={ctx.role === "admin"} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
          <div>
            <p className="font-semibold">{ctx.org.name}</p>
            <p className="text-xs text-gray-500">
              {ctx.user.name} &middot; {ctx.user.email} &middot; {ctx.role}
            </p>
          </div>
          <SignOutButton />
        </header>
        <main className="flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
