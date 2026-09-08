"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { programs } from "@/db/schema";
import { requireAdmin, requireOrgContext } from "@/lib/org";
import { getProgramForOrg } from "@/lib/queries";

const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

const programSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  description: z.preprocess(emptyToUndefined, z.string().trim().max(5000).optional()),
  status: z.enum(["not_started", "in_progress", "blocked", "completed", "cancelled"]),
  ownerId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  startDate: z.preprocess(emptyToUndefined, z.string().optional()),
  targetEndDate: z.preprocess(emptyToUndefined, z.string().optional()),
});

function parseProgramForm(formData: FormData) {
  return programSchema.parse({
    name: formData.get("name"),
    description: formData.get("description"),
    status: formData.get("status"),
    ownerId: formData.get("ownerId"),
    startDate: formData.get("startDate"),
    targetEndDate: formData.get("targetEndDate"),
  });
}

export async function createProgram(formData: FormData) {
  const ctx = await requireOrgContext();
  requireAdmin(ctx);

  const data = parseProgramForm(formData);

  const [program] = await db
    .insert(programs)
    .values({
      orgId: ctx.org.id,
      name: data.name,
      description: data.description ?? null,
      status: data.status,
      ownerId: data.ownerId ?? null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      targetEndDate: data.targetEndDate ? new Date(data.targetEndDate) : null,
    })
    .returning();

  revalidatePath("/dashboard/programs");
  redirect(`/dashboard/programs/${program.id}`);
}

export async function updateProgram(programId: string, formData: FormData) {
  const ctx = await requireOrgContext();
  requireAdmin(ctx);

  const existing = await getProgramForOrg(programId, ctx.org.id);
  if (!existing) {
    throw new Error("Program not found");
  }

  const data = parseProgramForm(formData);

  await db
    .update(programs)
    .set({
      name: data.name,
      description: data.description ?? null,
      status: data.status,
      ownerId: data.ownerId ?? null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      targetEndDate: data.targetEndDate ? new Date(data.targetEndDate) : null,
      updatedAt: new Date(),
    })
    .where(eq(programs.id, programId));

  revalidatePath("/dashboard/programs");
  revalidatePath(`/dashboard/programs/${programId}`);
  redirect(`/dashboard/programs/${programId}`);
}

export async function deleteProgram(programId: string) {
  const ctx = await requireOrgContext();
  requireAdmin(ctx);

  const existing = await getProgramForOrg(programId, ctx.org.id);
  if (!existing) {
    throw new Error("Program not found");
  }

  await db.delete(programs).where(eq(programs.id, programId));

  revalidatePath("/dashboard/programs");
  redirect("/dashboard/programs");
}
