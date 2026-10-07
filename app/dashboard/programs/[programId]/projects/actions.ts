"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { toDateOrNull } from "@/lib/dates";
import { requireOrgContext } from "@/lib/org";
import { getProgramForOrg, getProjectForOrg, getProjectForProgram, resolveOrgMemberId } from "@/lib/queries";
import { fieldChanges, logActivity } from "@/lib/activity";
import { formErrorState } from "@/lib/form-errors";
import type { FormState } from "@/lib/form-state";

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

/** Records a project event in the project's and its program's history. */
async function logProjectActivity(
  ctx: { user: { id: string }; org: { id: string } },
  project: { id: string; name: string; programId: string },
  events: Parameters<typeof logActivity>[3],
) {
  await logActivity(
    ctx.user.id,
    { orgId: ctx.org.id, programId: project.programId, projectId: project.id },
    { type: "project", id: project.id, name: project.name },
    events,
  );
}

export async function createProject(programId: string, formData: FormData): Promise<FormState> {
  // Input problems come back to the form as messages (formErrorState);
  // anything else, including the success redirect, is rethrown.
  try {
    const ctx = await requireOrgContext();

    const program = await getProgramForOrg(programId, ctx.org.id);
    if (!program) {
      throw new Error("Program not found");
    }

    const data = parseProjectForm(formData);
    const leadId = await resolveOrgMemberId(data.leadId, ctx.org.id);

    const [project] = await db
      .insert(projects)
      .values({
        programId: program.id,
        name: data.name,
        description: data.description ?? null,
        status: data.status,
        priority: data.priority,
        leadId,
        startDate: toDateOrNull(data.startDate),
        dueDate: toDateOrNull(data.dueDate),
        sortOrder: Date.now(),
      })
      .returning();

    await logProjectActivity(ctx, project, [{ action: "created" }]);
    revalidatePath(`/dashboard/programs/${programId}`);
    redirect(`/dashboard/programs/${programId}/projects/${project.id}`);
  } catch (err) {
    return formErrorState(err);
  }
}

export async function updateProject(programId: string, projectId: string, formData: FormData): Promise<FormState> {
  // Input problems come back to the form as messages (formErrorState);
  // anything else, including the success redirect, is rethrown.
  try {
    const ctx = await requireOrgContext();

    const existing = await getProjectForProgram(projectId, programId, ctx.org.id);
    if (!existing) {
      throw new Error("Project not found");
    }

    const data = parseProjectForm(formData);
    const leadId = await resolveOrgMemberId(data.leadId, ctx.org.id);

    const tracked = {
      name: data.name,
      status: data.status,
      priority: data.priority,
      leadId,
      startDate: toDateOrNull(data.startDate),
      dueDate: toDateOrNull(data.dueDate),
    };
    await db
      .update(projects)
      .set({ ...tracked, description: data.description ?? null, updatedAt: new Date() })
      .where(eq(projects.id, projectId));
    await logProjectActivity(ctx, { ...existing, name: data.name }, await fieldChanges(existing, tracked));

    revalidatePath(`/dashboard/programs/${programId}`);
    revalidatePath(`/dashboard/programs/${programId}/projects/${projectId}`);
    redirect(`/dashboard/programs/${programId}/projects/${projectId}`);
  } catch (err) {
    return formErrorState(err);
  }
}

export async function deleteProject(programId: string, projectId: string) {
  const ctx = await requireOrgContext();

  const existing = await getProjectForProgram(projectId, programId, ctx.org.id);
  if (!existing) {
    throw new Error("Project not found");
  }

  await db.delete(projects).where(eq(projects.id, projectId));
  await logProjectActivity(ctx, existing, [{ action: "deleted" }]);

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
  await logProjectActivity(ctx, existing, await fieldChanges(existing, { status: parsedStatus }));

  revalidatePath(`/dashboard/programs/${programId}`);
  revalidatePath(`/dashboard/programs/${programId}/board`);
}

/**
 * Lightweight start+due date update, used by the Gantt view's drag-to-resize
 * handles. Scoped by project id alone (not a pre-bound programId) since the
 * hierarchical Gantt view can show projects from many programs on one page.
 */
export async function updateProjectDates(projectId: string, startDate: string, dueDate: string) {
  const ctx = await requireOrgContext();

  const existing = await getProjectForOrg(projectId, ctx.org.id);
  if (!existing) {
    throw new Error("Project not found");
  }

  const dates = { startDate: toDateOrNull(startDate), dueDate: toDateOrNull(dueDate) };
  await db
    .update(projects)
    .set({ ...dates, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
  await logProjectActivity(ctx, existing, await fieldChanges(existing, dates));
  // No revalidatePath: the Gantt already shows the new dates, and in a
  // server action revalidating re-renders the open page, re-running its whole
  // tree query on every drag. Every page is dynamic, so others are fresh on
  // the next visit.
}
