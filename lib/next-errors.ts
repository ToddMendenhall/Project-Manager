/**
 * Next's redirect() and notFound() work by throwing errors whose `digest`
 * starts with "NEXT_". When a client catches a failed server action it
 * must ignore those: they mean the action succeeded and navigation is
 * under way.
 */
export function isNextNavigationError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_")
  );
}
