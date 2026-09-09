"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { programs } from "@/db/schema";
import { requireAdmin, requireOrgContext } from "@/lib/org";
import { getPortfolioForOrg, getProgramForOrg } from "@/lib/queries";

const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

const programSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  description: z.preprocess(emptyToUndefined, z.string().trim().max(5000).optional()),
  portfolioId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  status: z.enum(["not_started", "in_progress", "blocked", "completed", "cancelled"]),
  ownerId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  startDate: z.preprocess(emptyToUndefined, z.string().optional()),
  targetEndDate: z.preprocess(emptyToUndefined, z.string().optional()),
});

function parseProgramForm(formData: FormData) {
  return programSchema.parse({
    name: formData.get("name"),
    description: formData.get("description"),
    portfolioId: formData.get("portfolioId"),
    status: formData.get("status"),
    ownerId: formData.get("ownerId"),
    startDate: formData.get("startDate"),
    targetEndDate: formData.get("targetEndDate"),
  });
}

/** Validates a submitted portfolioId actually belongs to this org, rather than trusting the form value outright. */
async function resolvePortfolioId(portfolioId: string | undefined, orgId: string) {
  if (!portfolioId) return null;
  const portfolio = await getPortfolioForOrg(portfolioId, orgId);
  return portfolio ? portfolio.id : null;
}

export async function createProgram(formData: FormData) {
  const ctx = await requireOrgContext();
  requireAdmin(ctx);

  const data = parseProgramForm(formData);
  const portfolioId = await resolvePortfolioId(data.portfolioId, ctx.org.id);

  const [program] = await db
    .insert(programs)
    .values({
      orgId: ctx.org.id,
      portfolioId,
      name: data.name,
      description: data.description ?? null,
      status: data.status,
      ownerId: data.ownerId ?? null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      targetEndDate: data.targetEndDate ? new Date(data.targetEndDate) : null,
    })
    .returning();

  revalidatePath("/dashboard/programs");
  revalidatePath("/dashboard/portfolios");
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
  const portfolioId = await resolvePortfolioId(data.portfolioId, ctx.org.id);

  await db
    .update(programs)
    .set({
      portfolioId,
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
  revalidatePath("/dashboard/portfolios");
  if (existing.portfolioId) revalidatePath(`/dashboard/portfolios/${existing.portfolioId}`);
  if (portfolioId && portfolioId !== existing.portfolioId) {
    revalidatePath(`/dashboard/portfolios/${portfolioId}`);
  }
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
  if (existing.portfolioId) revalidatePath(`/dashboard/portfolios/${existing.portfolioId}`);
  redirect("/dashboard/programs");
}
