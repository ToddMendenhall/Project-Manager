"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { orgMembers, users } from "@/db/schema";
import { requireAdmin, requireOrgContext } from "@/lib/org";

// Managing other members' accounts is an admin-only capability — every
// action here re-checks requireAdmin server-side even though the pages
// that call them are already admin-gated, since Server Actions are
// directly callable endpoints regardless of what the UI renders.

const roleSchema = z.enum(["admin", "member"]);

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
export async function createMember(formData: FormData) {
  const ctx = await requireOrgContext();
  requireAdmin(ctx);

  const data = createMemberSchema.parse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
  });

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, data.email)).limit(1);
  if (existing) {
    throw new Error("An account with that email already exists.");
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
  redirect("/dashboard/members");
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

export async function updateMemberRole(userId: string, role: string) {
  const ctx = await requireOrgContext();
  requireAdmin(ctx);

  if (userId === ctx.user.id) {
    throw new Error("You can't change your own role.");
  }

  const parsedRole = roleSchema.parse(role);

  const membership = await getMembership(userId, ctx.org.id);
  if (!membership) {
    throw new Error("Member not found");
  }

  if (membership.role === "admin" && parsedRole !== "admin" && (await countOrgAdmins(ctx.org.id)) <= 1) {
    throw new Error("The organization must have at least one admin.");
  }

  await db.update(orgMembers).set({ role: parsedRole }).where(eq(orgMembers.id, membership.id));

  revalidatePath("/dashboard/members");
}

export async function deleteMember(userId: string) {
  const ctx = await requireOrgContext();
  requireAdmin(ctx);

  if (userId === ctx.user.id) {
    throw new Error("You can't delete your own account.");
  }

  const membership = await getMembership(userId, ctx.org.id);
  if (!membership) {
    throw new Error("Member not found");
  }

  if (membership.role === "admin" && (await countOrgAdmins(ctx.org.id)) <= 1) {
    throw new Error("The organization must have at least one admin.");
  }

  // Deleting the user row cascades to their org membership, comments, and
  // attachments, and clears assignee/owner/lead references elsewhere to
  // null — see the onDelete rules on those foreign keys in db/schema.ts.
  await db.delete(users).where(eq(users.id, userId));

  revalidatePath("/dashboard/members");
}
