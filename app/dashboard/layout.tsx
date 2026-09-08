import type { ReactNode } from "react";
import { requireOrgContext } from "@/lib/org";
import { signOut } from "@/lib/auth";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const ctx = await requireOrgContext();

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
        <div>
          <p className="font-semibold">{ctx.org.name}</p>
          <p className="text-xs text-gray-500">
            {ctx.user.name} &middot; {ctx.user.email} &middot; {ctx.role}
          </p>
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button type="submit" className="text-sm text-gray-500 underline">
            Sign out
          </button>
        </form>
      </header>
      <main className="px-6 py-8">{children}</main>
    </div>
  );
}
