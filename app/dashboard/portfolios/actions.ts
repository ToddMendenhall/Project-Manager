"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { portfolios } from "@/db/schema";
import { requireAdmin, requireOrgContext } from "@/lib/org";
import { getPortfolioForOrg } from "@/lib/queries";

const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

const portfolioSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  description: z.preprocess(emptyToUndefined, z.string().trim().max(5000).optional()),
  status: z.enum(["not_started", "in_progress", "blocked", "completed", "cancelled"]),
  ownerId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  startDate: z.preprocess(emptyToUndefined, z.string().optional()),
  targetEndDate: z.preprocess(emptyToUndefined, z.string().optional()),
});

function parsePortfolioForm(formData: FormData) {
  return portfolioSchema.parse({
    name: formData.get("name"),
    description: formData.get("description"),
    status: formData.get("status"),
    ownerId: formData.get("ownerId"),
    startDate: formData.get("startDate"),
    targetEndDate: formData.get("targetEndDate"),
  });
}

export async function createPortfolio(formData: FormData) {
  const ctx = await requireOrgContext();
  requireAdmin(ctx);

  const data = parsePortfolioForm(formData);

  const [portfolio] = await db
    .insert(portfolios)
    .values({
      orgId: ctx.org.id,
      name: data.name,
      description: data.description ?? null,
      status: data.status,
      ownerId: data.ownerId ?? null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      targetEndDate: data.targetEndDate ? new Date(data.targetEndDate) : null,
      sortOrder: Date.now(),
    })
    .returning();

  revalidatePath("/dashboard/portfolios");
  redirect(`/dashboard/portfolios/${portfolio.id}`);
}

export async function updatePortfolio(portfolioId: string, formData: FormData) {
  const ctx = await requireOrgContext();
  requireAdmin(ctx);

  const existing = await getPortfolioForOrg(portfolioId, ctx.org.id);
  if (!existing) {
    throw new Error("Portfolio not found");
  }

  const data = parsePortfolioForm(formData);

  await db
    .update(portfolios)
    .set({
      name: data.name,
      description: data.description ?? null,
      status: data.status,
      ownerId: data.ownerId ?? null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      targetEndDate: data.targetEndDate ? new Date(data.targetEndDate) : null,
      updatedAt: new Date(),
    })
    .where(eq(portfolios.id, portfolioId));

  revalidatePath("/dashboard/portfolios");
  revalidatePath(`/dashboard/portfolios/${portfolioId}`);
  redirect(`/dashboard/portfolios/${portfolioId}`);
}

export async function deletePortfolio(portfolioId: string) {
  const ctx = await requireOrgContext();
  requireAdmin(ctx);

  const existing = await getPortfolioForOrg(portfolioId, ctx.org.id);
  if (!existing) {
    throw new Error("Portfolio not found");
  }

  // Programs in this portfolio are un-grouped (portfolioId set null by the
  // FK), not deleted — see the schema comment on programs.portfolioId.
  await db.delete(portfolios).where(eq(portfolios.id, portfolioId));

  revalidatePath("/dashboard/portfolios");
  revalidatePath("/dashboard/programs");
  redirect("/dashboard/portfolios");
}

const statusEnum = z.enum(["not_started", "in_progress", "blocked", "completed", "cancelled"]);

/** Lightweight status+order update, used by the Board view's drag-and-drop. */
export async function updatePortfolioOrder(portfolioId: string, status: string, sortOrder: number) {
  const ctx = await requireOrgContext();
  requireAdmin(ctx);

  const existing = await getPortfolioForOrg(portfolioId, ctx.org.id);
  if (!existing) {
    throw new Error("Portfolio not found");
  }

  const parsedStatus = statusEnum.parse(status);
  const parsedSortOrder = z.number().finite().parse(sortOrder);

  await db
    .update(portfolios)
    .set({ status: parsedStatus, sortOrder: parsedSortOrder, updatedAt: new Date() })
    .where(eq(portfolios.id, portfolioId));

  revalidatePath("/dashboard/portfolios");
  revalidatePath(`/dashboard/portfolios/${portfolioId}`);
  revalidatePath(`/dashboard/portfolios/${portfolioId}/board`);
  revalidatePath("/dashboard/portfolios/board");
}

/** Lightweight start+target-end date update, used by the Gantt view's drag-to-resize handles. */
export async function updatePortfolioDates(portfolioId: string, startDate: string, targetEndDate: string) {
  const ctx = await requireOrgContext();
  requireAdmin(ctx);

  const existing = await getPortfolioForOrg(portfolioId, ctx.org.id);
  if (!existing) {
    throw new Error("Portfolio not found");
  }

  await db
    .update(portfolios)
    .set({
      startDate: startDate ? new Date(startDate) : null,
      targetEndDate: targetEndDate ? new Date(targetEndDate) : null,
      updatedAt: new Date(),
    })
    .where(eq(portfolios.id, portfolioId));

  revalidatePath(`/dashboard/portfolios/${portfolioId}`);
  revalidatePath(`/dashboard/portfolios/${portfolioId}/gantt`);
  revalidatePath("/dashboard/portfolios/gantt");
}
