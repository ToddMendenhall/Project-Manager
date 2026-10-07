"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomBytes, randomInt } from "crypto";
import { revalidatePath } from "next/cache";
import { and, count, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { invites, orgMembers, users } from "@/db/schema";
import { requireAdmin, requireOrgContext } from "@/lib/org";
import { RATE_LIMITS, recordAttempt, retryAfterSeconds } from "@/lib/rate-limit";

const INVITE_TTL_DAYS = 7;

// Managing other members' accounts is an admin-only capability — every
// action here re-checks requireAdmin server-side even though the pages
// that call them are already admin-gated, since Server Actions are
// directly callable endpoints regardless of what the UI renders.
//
// Expected, user-facing validation failures (duplicate email, self-action
// guards, last-admin guard) are *returned* as { ok: false, error } rather
// than thrown: in production, Next.js redacts the message of anything
// thrown out of a Server Action (replacing it with a generic "omitted in
// production builds" notice) to avoid leaking server internals, even when
// the caller catches it — so a deliberately friendly message must travel
// back as plain return data instead.

export type ActionResult = { ok: true } | { ok: false; error: string };
export type ResetPasswordResult = { ok: true; password: string } | { ok: false; error: string };
export type CreateInviteResult = { ok: true; inviteUrl: string } | { ok: false; error: string };

const roleSchema = z.enum(["admin", "member"]);

// Excludes visually ambiguous characters (0/O, 1/l/I) so a generated
// password is easier to transcribe by hand if it needs to be.
const PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";

function generatePassword(length = 16) {
  let password = "";
  for (let i = 0; i < length; i++) {
    password += PASSWORD_CHARS[randomInt(PASSWORD_CHARS.length)];
  }
  return password;
}

const createInviteSchema = z.object({
  email: z
    .string()
    .email()
    .transform((v) => v.trim().toLowerCase()),
  role: roleSchema,
});

/**
 * Creates a pending invite and returns its accept-link path — there's no
 * email sending wired up yet, so the admin copies the link and sends it
 * themselves (Slack, text, etc.). The recipient sets their own name and
 * password on the accept page; nobody but them ever knows it.
 */
export async function createInvite(formData: FormData): Promise<CreateInviteResult> {
  const ctx = await requireOrgContext();
  requireAdmin(ctx);

  // Throttled per admin: each attempt also reveals whether an email has an
  // account (below), and invites are otherwise unlimited.
  if ((await retryAfterSeconds(RATE_LIMITS.inviteCreate, ctx.user.id)) > 0) {
    return { ok: false, error: "Too many invites in the last hour. Try again later." };
  }
  await recordAttempt(RATE_LIMITS.inviteCreate, ctx.user.id);

  const parsed = createInviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, data.email)).limit(1);
  if (existingUser) {
    return { ok: false, error: "An account with that email already exists." };
  }

  const [existingInvite] = await db
    .select({ id: invites.id })
    .from(invites)
    .where(and(eq(invites.orgId, ctx.org.id), eq(invites.email, data.email), isNull(invites.acceptedAt)))
    .limit(1);
  if (existingInvite) {
    return { ok: false, error: "An invite is already pending for that email. Revoke it first to send a new one." };
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(invites).values({
    orgId: ctx.org.id,
    email: data.email,
    role: data.role,
    token,
    invitedById: ctx.user.id,
    expiresAt,
  });

  revalidatePath("/dashboard/members");
  return { ok: true, inviteUrl: `/invite/${token}` };
}

export async function revokeInvite(inviteId: string): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  requireAdmin(ctx);

  const [existing] = await db
    .select({ id: invites.id })
    .from(invites)
    .where(and(eq(invites.id, inviteId), eq(invites.orgId, ctx.org.id)))
    .limit(1);
  if (!existing) {
    return { ok: false, error: "Invite not found." };
  }

  await db.delete(invites).where(eq(invites.id, inviteId));

  revalidatePath("/dashboard/members");
  return { ok: true };
}

async function getMembership(userId: string, orgId: string) {
  const [membership] = await db
    .select({ id: orgMembers.id, role: orgMembers.role })
    .from(orgMembers)
    .where(and(eq(orgMembers.userId, userId), eq(orgMembers.orgId, orgId)))
    .limit(1);
  return membership ?? null;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The org's admin memberships, locked until the transaction ends. Two admins
 * demoting or deleting each other at the same moment both used to see "2
 * admins" and both succeed, leaving none; with the lock the second waits,
 * then re-reads and sees only one.
 */
async function lockOrgAdmins(tx: Tx, orgId: string) {
  return tx
    .select({ id: orgMembers.id })
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.role, "admin")))
    .for("update");
}

/**
 * Password resets and deletes change the global `users` row, which is only
 * safe while each person belongs to exactly one organization (invites and
 * registration reject existing emails today). Refuse if that ever stops
 * being true, so one org's admin can't take over an account used elsewhere.
 */
async function belongsToOtherOrg(userId: string, orgId: string) {
  const [row] = await db
    .select({ value: count() })
    .from(orgMembers)
    .where(and(eq(orgMembers.userId, userId), ne(orgMembers.orgId, orgId)));
  return row.value > 0;
}

const LAST_ADMIN = "The organization must have at least one admin.";

export async function updateMemberRole(userId: string, role: string): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  requireAdmin(ctx);

  if (userId === ctx.user.id) {
    return { ok: false, error: "You can't change your own role." };
  }

  const parsedRole = roleSchema.safeParse(role);
  if (!parsedRole.success) {
    return { ok: false, error: "Invalid role." };
  }

  const membership = await getMembership(userId, ctx.org.id);
  if (!membership) {
    return { ok: false, error: "Member not found." };
  }

  const refused = await db.transaction(async (tx) => {
    const admins = await lockOrgAdmins(tx, ctx.org.id);
    const isAdmin = admins.some((a) => a.id === membership.id);
    if (isAdmin && parsedRole.data !== "admin" && admins.length <= 1) return LAST_ADMIN;
    await tx.update(orgMembers).set({ role: parsedRole.data }).where(eq(orgMembers.id, membership.id));
    return null;
  });
  if (refused) {
    return { ok: false, error: refused };
  }

  revalidatePath("/dashboard/members");
  return { ok: true };
}

/** Generates a brand-new password for a member and returns it once — the admin hands it off directly, same as at creation. */
export async function resetMemberPassword(userId: string): Promise<ResetPasswordResult> {
  const ctx = await requireOrgContext();
  requireAdmin(ctx);

  const membership = await getMembership(userId, ctx.org.id);
  if (!membership) {
    return { ok: false, error: "Member not found." };
  }

  if (await belongsToOtherOrg(userId, ctx.org.id)) {
    return { ok: false, error: "This person also belongs to another organization, so their password can't be reset here." };
  }

  const password = generatePassword();
  const passwordHash = await bcrypt.hash(password, 10);

  // Also ends every session they have, so a reset actually locks out
  // whoever might be using the old password.
  await db
    .update(users)
    .set({ passwordHash, sessionVersion: sql`${users.sessionVersion} + 1` })
    .where(eq(users.id, userId));

  revalidatePath("/dashboard/members");
  return { ok: true, password };
}

export async function deleteMember(userId: string): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  requireAdmin(ctx);

  if (userId === ctx.user.id) {
    return { ok: false, error: "You can't delete your own account." };
  }

  const membership = await getMembership(userId, ctx.org.id);
  if (!membership) {
    return { ok: false, error: "Member not found." };
  }

  if (await belongsToOtherOrg(userId, ctx.org.id)) {
    return { ok: false, error: "This person also belongs to another organization, so their account can't be deleted here." };
  }

  // Deleting the user row cascades to their org membership, comments, and
  // attachments, and clears assignee/owner/lead references elsewhere to
  // null — see the onDelete rules on those foreign keys in db/schema.ts.
  const refused = await db.transaction(async (tx) => {
    const admins = await lockOrgAdmins(tx, ctx.org.id);
    if (admins.some((a) => a.id === membership.id) && admins.length <= 1) return LAST_ADMIN;
    await tx.delete(users).where(eq(users.id, userId));
    return null;
  });
  if (refused) {
    return { ok: false, error: refused };
  }

  revalidatePath("/dashboard/members");
  return { ok: true };
}
