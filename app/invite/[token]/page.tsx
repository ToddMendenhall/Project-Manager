import Link from "next/link";
import { getInviteByToken } from "@/lib/queries";
import { AcceptInviteForm } from "@/components/invite/accept-invite-form";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await getInviteByToken(token);

  if (!invite) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4 text-center">
        <h1 className="text-xl font-semibold">Invalid invite</h1>
        <p className="text-sm text-gray-500">
          This invite link doesn&apos;t exist. Ask the person who invited you for a new one.
        </p>
        <Link href="/login" className="text-sm underline">
          Sign in
        </Link>
      </main>
    );
  }

  if (invite.acceptedAt) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4 text-center">
        <h1 className="text-xl font-semibold">Invite already used</h1>
        <p className="text-sm text-gray-500">
          This invite has already been accepted. If that was you, sign in instead.
        </p>
        <Link href="/login" className="text-sm underline">
          Sign in
        </Link>
      </main>
    );
  }

  if (invite.expiresAt < new Date()) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4 text-center">
        <h1 className="text-xl font-semibold">Invite expired</h1>
        <p className="text-sm text-gray-500">
          This invite link has expired. Ask the person who invited you to send a new one.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <h1 className="text-2xl font-semibold">Join {invite.orgName}</h1>
        <p className="text-sm text-gray-500">
          You&apos;ve been invited as <span className="font-medium text-gray-700">{invite.email}</span>. Set your
          name and password to finish joining.
        </p>
      </div>
      <AcceptInviteForm token={token} email={invite.email} />
    </main>
  );
}
