import "server-only";
import { cache } from "react";
import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { orgMembers, organizations } from "@/db/schema";
import { auth } from "@/lib/auth";

export type OrgContext = {
  user: { id: string; email: string; name: string };
  org: { id: string; name: string; slug: string };
  role: "admin" | "member";
};

/**
 * Phase 1 keeps org scoping simple: a user's "current" organization is
 * whichever one they joined first. Multi-org switching is out of scope
 * until a later phase.
 */
export async function getPrimaryOrgMembership(userId: string) {
  const [row] = await db
    .select({
      orgId: organizations.id,
      orgName: organizations.name,
      orgSlug: organizations.slug,
      role: orgMembers.role,
    })
    .from(orgMembers)
    .innerJoin(organizations, eq(orgMembers.orgId, organizations.id))
    .where(eq(orgMembers.userId, userId))
    .orderBy(asc(orgMembers.createdAt))
    .limit(1);

  return row ?? null;
}

/**
 * Server-side guard: ensures a logged-in user with an org, or redirects.
 *
 * Memoized per request with React's `cache()`: the dashboard layout, the
 * page and any nested server components each call this, and without it
 * every one repeats the session decode and the membership query. (Outside
 * a render, e.g. in a Server Action, `cache()` is a plain passthrough.)
 */
export const requireOrgContext = cache(async function requireOrgContext(): Promise<OrgContext> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email || !session.user.name) {
    redirect("/login");
  }

  const membership = await getPrimaryOrgMembership(session.user.id);
  if (!membership) {
    redirect("/onboarding");
  }

  return {
    user: { id: session.user.id, email: session.user.email, name: session.user.name },
    org: { id: membership.orgId, name: membership.orgName, slug: membership.orgSlug },
    role: membership.role,
  };
});

/** Throws if the current org context is not an admin — use in mutating routes. */
export function requireAdmin(ctx: OrgContext) {
  if (ctx.role !== "admin") {
    throw new Error("Forbidden: admin role required");
  }
}
