"use server";

import { z } from "zod";
import { statusSchema } from "@/lib/field-schemas";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { programs } from "@/db/schema";
import { toDateOrNull } from "@/lib/dates";
import { requireOrgContext } from "@/lib/org";
import { getPortfolioForOrg, getProgramForOrg, resolveOrgMemberId } from "@/lib/queries";
import { fieldChanges, logActivity } from "@/lib/activity";
import { formErrorState } from "@/lib/form-errors";
import type { FormState } from "@/lib/form-state";

const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

const programSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  description: z.preprocess(emptyToUndefined, z.string().trim().max(5000).optional()),
  portfolioId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  status: statusSchema,
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

/**
 * Records a program event in its history. Deleting a program isn't recorded:
 * its history is deleted with it, and nothing above a program shows history.
 */
async function logProgramActivity(
  ctx: { user: { id: string }; org: { id: string } },
  program: { id: string; name: string },
  events: Parameters<typeof logActivity>[3],
) {
  await logActivity(
    ctx.user.id,
    { orgId: ctx.org.id, programId: program.id },
    { type: "program", id: program.id, name: program.name },
    events,
  );
}

/** Validates a submitted portfolioId actually belongs to this org, rather than trusting the form value outright. */
async function resolvePortfolioId(portfolioId: string | undefined, orgId: string) {
  if (!portfolioId) return null;
  const portfolio = await getPortfolioForOrg(portfolioId, orgId);
  return portfolio ? portfolio.id : null;
}

export async function createProgram(formData: FormData): Promise<FormState> {
  // Input problems come back to the form as messages (formErrorState);
  // anything else, including the success redirect, is rethrown.
  try {
    const ctx = await requireOrgContext();

    const data = parseProgramForm(formData);
    const ownerId = await resolveOrgMemberId(data.ownerId, ctx.org.id);
    const portfolioId = await resolvePortfolioId(data.portfolioId, ctx.org.id);

    const [program] = await db
      .insert(programs)
      .values({
        orgId: ctx.org.id,
        portfolioId,
        name: data.name,
        description: data.description ?? null,
        status: data.status,
        ownerId,
        startDate: toDateOrNull(data.startDate),
        targetEndDate: toDateOrNull(data.targetEndDate),
        sortOrder: Date.now(),
      })
      .returning();

    await logProgramActivity(ctx, program, [{ action: "created" }]);
    revalidatePath("/dashboard/programs");
    revalidatePath("/dashboard/portfolios");
    redirect(`/dashboard/programs/${program.id}`);
  } catch (err) {
    return formErrorState(err);
  }
}

export async function updateProgram(programId: string, formData: FormData): Promise<FormState> {
  // Input problems come back to the form as messages (formErrorState);
  // anything else, including the success redirect, is rethrown.
  try {
    const ctx = await requireOrgContext();

    const existing = await getProgramForOrg(programId, ctx.org.id);
    if (!existing) {
      throw new Error("Program not found");
    }

    const data = parseProgramForm(formData);
    const ownerId = await resolveOrgMemberId(data.ownerId, ctx.org.id);
    const portfolioId = await resolvePortfolioId(data.portfolioId, ctx.org.id);

    const tracked = {
      name: data.name,
      status: data.status,
      ownerId,
      startDate: toDateOrNull(data.startDate),
      targetEndDate: toDateOrNull(data.targetEndDate),
    };
    await db
      .update(programs)
      .set({ ...tracked, portfolioId, description: data.description ?? null, updatedAt: new Date() })
      .where(eq(programs.id, programId));
    await logProgramActivity(ctx, { id: programId, name: data.name }, await fieldChanges(existing, tracked));

    revalidatePath("/dashboard/programs");
    revalidatePath(`/dashboard/programs/${programId}`);
    revalidatePath("/dashboard/portfolios");
    if (existing.portfolioId) revalidatePath(`/dashboard/portfolios/${existing.portfolioId}`);
    if (portfolioId && portfolioId !== existing.portfolioId) {
      revalidatePath(`/dashboard/portfolios/${portfolioId}`);
    }
    redirect(`/dashboard/programs/${programId}`);
  } catch (err) {
    return formErrorState(err);
  }
}

export async function deleteProgram(programId: string) {
  const ctx = await requireOrgContext();

  const existing = await getProgramForOrg(programId, ctx.org.id);
  if (!existing) {
    throw new Error("Program not found");
  }

  await db.delete(programs).where(eq(programs.id, programId));

  revalidatePath("/dashboard/programs");
  if (existing.portfolioId) revalidatePath(`/dashboard/portfolios/${existing.portfolioId}`);
  redirect("/dashboard/programs");
}


/** Lightweight status+order update, used by the Board view's drag-and-drop. */
export async function updateProgramOrder(programId: string, status: string, sortOrder: number) {
  const ctx = await requireOrgContext();

  const existing = await getProgramForOrg(programId, ctx.org.id);
  if (!existing) {
    throw new Error("Program not found");
  }

  const parsedStatus = statusSchema.parse(status);
  const parsedSortOrder = z.number().finite().parse(sortOrder);

  await db
    .update(programs)
    .set({ status: parsedStatus, sortOrder: parsedSortOrder, updatedAt: new Date() })
    .where(eq(programs.id, programId));
  await logProgramActivity(ctx, existing, await fieldChanges(existing, { status: parsedStatus }));

  revalidatePath("/dashboard/programs");
  revalidatePath(`/dashboard/programs/${programId}`);
  revalidatePath(`/dashboard/programs/${programId}/board`);
  revalidatePath("/dashboard/programs/board");
  if (existing.portfolioId) {
    revalidatePath(`/dashboard/portfolios/${existing.portfolioId}`);
    revalidatePath(`/dashboard/portfolios/${existing.portfolioId}/board`);
  }
}

/** Lightweight start+due date update, used by the Gantt view's drag-to-resize handles. */
export async function updateProgramDates(programId: string, startDate: string, targetEndDate: string) {
  const ctx = await requireOrgContext();

  const existing = await getProgramForOrg(programId, ctx.org.id);
  if (!existing) {
    throw new Error("Program not found");
  }

  const dates = { startDate: toDateOrNull(startDate), targetEndDate: toDateOrNull(targetEndDate) };
  await db
    .update(programs)
    .set({ ...dates, updatedAt: new Date() })
    .where(eq(programs.id, programId));
  await logProgramActivity(ctx, existing, await fieldChanges(existing, dates));
  // No revalidatePath: the Gantt already shows the new dates, and in a
  // server action revalidating re-renders the open page, re-running its whole
  // tree query on every drag. Every page is dynamic, so others are fresh on
  // the next visit.
}
