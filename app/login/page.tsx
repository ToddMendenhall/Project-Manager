import { isRegistrationOpen } from "@/lib/registration";
import { LoginPageClient } from "@/components/auth/login-form";

// Rendered per request so ALLOW_REGISTRATION takes effect without a rebuild.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <LoginPageClient allowRegistration={isRegistrationOpen()} />;
}
