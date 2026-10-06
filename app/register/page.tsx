import Link from "next/link";
import { isRegistrationOpen } from "@/lib/registration";
import { RegisterForm } from "@/components/auth/register-form";

// Rendered per request so ALLOW_REGISTRATION takes effect without a rebuild.
export const dynamic = "force-dynamic";

export default function RegisterPage() {
  if (isRegistrationOpen()) return <RegisterForm />;

  return (
    <main className="flex min-h-screen items-center justify-center bg-cy-gray-025 px-4">
      <div className="w-full max-w-[400px] overflow-hidden rounded-card border border-cy-gray-200 bg-white shadow-xs">
        <div className="h-[3px] bg-cy-navy" />
        <div className="flex flex-col gap-3 p-8">
          <h1 className="text-xl font-semibold text-cy-gray-900">Registration is closed</h1>
          <p className="text-sm text-cy-gray-500">
            New organizations can't be created here. To join an existing one, ask its admin for an invite link.
          </p>
          <Link href="/login" className="text-sm text-cy-blue-600 hover:underline">
            Back to sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
