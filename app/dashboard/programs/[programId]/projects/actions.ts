"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { requireAdmin, requireOrgContext } from "@/lib/org";
import { getProgramForOrg, getProjectForProgram } from "@/lib/queries";

const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

const projectSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  description: z.preprocess(emptyToUndefined, z.string().trim().max(5000).optional()),
  status: z.enum(["not_started", "in_progress", "blocked", "completed", "cancelled"]),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  leadId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  startDate: z.preprocess(emptyToUndefined, z.string().optional()),
  dueDate: z.preprocess(emptyToUndefined, z.string().optional()),
});

function parseProjectForm(formData: FormData) {
  return projectSchema.parse({
    name: formData.get("name"),
    description: formData.get("description"),
    status: formData.get("status"),
    priority: formData.get("priority"),
    leadId: formData.get("leadId"),
    startDate: formData.get("startDate"),
    dueDate: formData.get("dueDate"),
  });
}

export async function createProject(programId: string, formData: FormData) {
  const ctx = await requireOrgContext();
  requireAdmin(ctx);

  const program = await getProgramForOrg(programId, ctx.org.id);
  if (!program) {
    throw new Error("Program not found");
  }

  const data = parseProjectForm(formData);

  const [project] = await db
    .insert(projects)
    .values({
      programId: program.id,
      name: data.name,
      description: data.description ?? null,
      status: data.status,
      priority: data.priority,
      leadId: data.leadId ?? null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      sortOrder: Date.now(),
    })
    .returning();

  revalidatePath(`/dashboard/programs/${programId}`);
  redirect(`/dashboard/programs/${programId}/projects/${project.id}`);
}

export async function updateProject(programId: string, projectId: string, formData: FormData) {
  const ctx = await requireOrgContext();
  requireAdmin(ctx);

  const existing = await getProjectForProgram(projectId, programId, ctx.org.id);
  if (!existing) {
    throw new Error("Project not found");
  }

  const data = parseProjectForm(formData);

  await db
    .update(projects)
    .set({
      name: data.name,
      description: data.description ?? null,
      status: data.status,
      priority: data.priority,
      leadId: data.leadId ?? null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId));

  revalidatePath(`/dashboard/programs/${programId}`);
  revalidatePath(`/dashboard/programs/${programId}/projects/${projectId}`);
  redirect(`/dashboard/programs/${programId}/projects/${projectId}`);
}

export async function deleteProject(programId: string, projectId: string) {
  const ctx = await requireOrgContext();
  requireAdmin(ctx);

  const existing = await getProjectForProgram(projectId, programId, ctx.org.id);
  if (!existing) {
    throw new Error("Project not found");
  }

  await db.delete(projects).where(eq(projects.id, projectId));

  revalidatePath(`/dashboard/programs/${programId}`);
  redirect(`/dashboard/programs/${programId}`);
}

const statusEnum = z.enum(["not_started", "in_progress", "blocked", "completed", "cancelled"]);

/** Lightweight status+order update, used by the Board view's drag-and-drop. */
export async function updateProjectOrder(
  programId: string,
  projectId: string,
  status: string,
  sortOrder: number,
) {
  const ctx = await requireOrgContext();
  requireAdmin(ctx);

  const existing = await getProjectForProgram(projectId, programId, ctx.org.id);
  if (!existing) {
    throw new Error("Project not found");
  }

  const parsedStatus = statusEnum.parse(status);
  const parsedSortOrder = z.number().finite().parse(sortOrder);

  await db
    .update(projects)
    .set({ status: parsedStatus, sortOrder: parsedSortOrder, updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  revalidatePath(`/dashboard/programs/${programId}`);
  revalidatePath(`/dashboard/programs/${programId}/board`);
}
