import Link from "next/link";

/** Any URL outside the app's routes. */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-cy-gray-025 p-6 text-center">
      <h1 className="text-xl font-semibold text-cy-gray-900">Page not found</h1>
      <p className="text-sm text-cy-gray-600">There&rsquo;s nothing at this address.</p>
      <Link href="/dashboard" className="text-sm font-medium text-cy-blue-600 hover:underline">
        Go to the dashboard
      </Link>
    </main>
  );
}
