import { auth, signOut } from "@/lib/auth";
import { getPrimaryOrgMembership } from "@/lib/org";
import { redirect } from "next/navigation";

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const membership = await getPrimaryOrgMembership(session.user.id);
  if (membership) {
    redirect("/dashboard");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-semibold">No organization yet</h1>
      <p className="text-sm text-gray-500">
        Your account isn't a member of any organization. Ask an admin to invite you, or sign out and
        create a new organization.
      </p>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <button type="submit" className="rounded bg-gray-900 px-4 py-2 text-white">
          Sign out
        </button>
      </form>
    </main>
  );
}
