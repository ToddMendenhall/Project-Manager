import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOrgContext } from "@/lib/org";
import { getOrgMembersDetailed, getPendingInvitesForOrg } from "@/lib/queries";
import { MembersTable } from "@/components/members/members-table";
import { PendingInvites } from "@/components/members/pending-invites";
import { updateMemberRole, deleteMember, resetMemberPassword, revokeInvite } from "./actions";

export default async function MembersPage() {
  const ctx = await requireOrgContext();
  if (ctx.role !== "admin") redirect("/dashboard");

  const [members, pendingInvites] = await Promise.all([
    getOrgMembersDetailed(ctx.org.id),
    getPendingInvitesForOrg(ctx.org.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Members</h1>
          <p className="text-sm text-gray-500">Manage who has access to {ctx.org.name} and their role.</p>
        </div>
        <Link href="/dashboard/members/new" className="rounded bg-gray-900 px-4 py-2 text-sm text-white">
          Invite Member
        </Link>
      </div>

      <PendingInvites invites={pendingInvites} onRevoke={revokeInvite} />

      <MembersTable
        members={members}
        currentUserId={ctx.user.id}
        onRoleChange={updateMemberRole}
        onDelete={deleteMember}
        onResetPassword={resetMemberPassword}
      />
    </div>
  );
}
