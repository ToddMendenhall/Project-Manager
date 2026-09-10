import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOrgContext } from "@/lib/org";
import { MemberForm } from "@/components/members/member-form";
import { createMember } from "../actions";

export default async function NewMemberPage() {
  const ctx = await requireOrgContext();
  if (ctx.role !== "admin") redirect("/dashboard/members");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/dashboard/members" className="text-sm text-gray-500 underline">
          &larr; Members
        </Link>
      </div>

      <h1 className="text-xl font-semibold">Add Member</h1>

      <MemberForm action={createMember} submitLabel="Create Account" />
    </div>
  );
}
