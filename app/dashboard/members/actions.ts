"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomInt } from "crypto";
import { revalidatePath } from "next/cache";
import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { orgMembers, users } from "@/db/schema";
import { requireAdmin, requireOrgContext } from "@/lib/org";

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

const createMemberSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  email: z
    .string()
    .email()
    .transform((v) => v.trim().toLowerCase()),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: roleSchema,
});

/** Admin-created accounts join this org directly — there's no invite/email flow yet. */
export async function createMember(formData: FormData): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  requireAdmin(ctx);

  const parsed = createMemberSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, data.email)).limit(1);
  if (existing) {
    return { ok: false, error: "An account with that email already exists." };
  }

  const passwordHash = await bcrypt.hash(data.password, 10);

  await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ email: data.email, name: data.name, passwordHash })
      .returning();
    await tx.insert(orgMembers).values({ orgId: ctx.org.id, userId: user.id, role: data.role });
  });

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

async function countOrgAdmins(orgId: string) {
  const [row] = await db
    .select({ value: count() })
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.role, "admin")));
  return row.value;
}

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

  if (membership.role === "admin" && parsedRole.data !== "admin" && (await countOrgAdmins(ctx.org.id)) <= 1) {
    return { ok: false, error: "The organization must have at least one admin." };
  }

  await db.update(orgMembers).set({ role: parsedRole.data }).where(eq(orgMembers.id, membership.id));

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

  const password = generatePassword();
  const passwordHash = await bcrypt.hash(password, 10);

  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));

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

  if (membership.role === "admin" && (await countOrgAdmins(ctx.org.id)) <= 1) {
    return { ok: false, error: "The organization must have at least one admin." };
  }

  // Deleting the user row cascades to their org membership, comments, and
  // attachments, and clears assignee/owner/lead references elsewhere to
  // null — see the onDelete rules on those foreign keys in db/schema.ts.
  await db.delete(users).where(eq(users.id, userId));

  revalidatePath("/dashboard/members");
  return { ok: true };
}
