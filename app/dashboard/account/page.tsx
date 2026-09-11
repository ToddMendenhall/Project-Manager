import { requireOrgContext } from "@/lib/org";
import { ChangePasswordForm } from "@/components/account/change-password-form";
import { changePassword } from "./actions";

export default async function AccountPage() {
  const ctx = await requireOrgContext();

  return (
    <div className="flex max-w-md flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">Account</h1>
        <p className="text-sm text-gray-500">Your account details for {ctx.org.name}.</p>
      </div>

      <dl className="flex flex-col gap-4 text-sm">
        <div>
          <dt className="font-medium text-gray-400">Name</dt>
          <dd className="text-gray-900">{ctx.user.name}</dd>
        </div>
        <div>
          <dt className="font-medium text-gray-400">Email</dt>
          <dd className="text-gray-900">{ctx.user.email}</dd>
        </div>
        <div>
          <dt className="font-medium text-gray-400">Role</dt>
          <dd className="capitalize text-gray-900">{ctx.role}</dd>
        </div>
      </dl>

      <div className="flex flex-col gap-3 border-t border-gray-200 pt-6">
        <h2 className="text-sm font-medium text-gray-700">Change Password</h2>
        <ChangePasswordForm action={changePassword} />
      </div>
    </div>
  );
}
