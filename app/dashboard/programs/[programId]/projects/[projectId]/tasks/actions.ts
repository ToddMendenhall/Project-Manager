"use server";

import { z } from "zod";
import { prioritySchema, statusSchema } from "@/lib/field-schemas";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { toDateOrNull } from "@/lib/dates";
import { requireOrgContext } from "@/lib/org";
import { getProjectForProgram, getTaskCustomFieldDefs, getTaskForOrg, getTaskForProject, resolveOrgMemberId } from "@/lib/queries";
import { parseCustomFieldValues } from "@/lib/custom-fields";
import { fieldChanges, logActivity } from "@/lib/activity";
import { formErrorState } from "@/lib/form-errors";
import type { FormState } from "@/lib/form-state";
import { projectPath } from "@/lib/paths";

// Like every level of the hierarchy, any org member (not just admins) can
// create, edit, or delete tasks.

const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

const taskSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(500),
  description: z.preprocess(emptyToUndefined, z.string().trim().max(5000).optional()),
  status: statusSchema,
  priority: prioritySchema,
  assigneeId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  startDate: z.preprocess(emptyToUndefined, z.string().optional()),
  dueDate: z.preprocess(emptyToUndefined, z.string().optional()),
});

function parseTaskForm(formData: FormData) {
  return taskSchema.parse({
    title: formData.get("title"),
    description: formData.get("description"),
    status: formData.get("status"),
    priority: formData.get("priority"),
    assigneeId: formData.get("assigneeId"),
    startDate: formData.get("startDate"),
    dueDate: formData.get("dueDate"),
  });
}

const basePath = (programId: string, projectId: string) =>
  projectPath(programId, projectId);

/** Records a task event in the task's, its project's and its program's history. */
async function logTaskActivity(
  ctx: { user: { id: string }; org: { id: string } },
  task: { id: string; title: string; projectId: string },
  programId: string,
  events: Parameters<typeof logActivity>[3],
) {
  await logActivity(
    ctx.user.id,
    { orgId: ctx.org.id, programId, projectId: task.projectId, taskId: task.id },
    { type: "task", id: task.id, name: task.title },
    events,
  );
}

export async function createTask(programId: string, projectId: string, formData: FormData): Promise<FormState> {
  // Input problems come back to the form as messages (formErrorState);
  // anything else, including the success redirect, is rethrown.
  try {
    const ctx = await requireOrgContext();

    const project = await getProjectForProgram(projectId, programId, ctx.org.id);
    if (!project) {
      throw new Error("Project not found");
    }

    const data = parseTaskForm(formData);
    const assigneeId = await resolveOrgMemberId(data.assigneeId, ctx.org.id);
    const fieldDefs = await getTaskCustomFieldDefs(programId);
    const customFields = parseCustomFieldValues(fieldDefs, formData);

    const [task] = await db
      .insert(tasks)
      .values({
        projectId: project.id,
        title: data.title,
        description: data.description ?? null,
        status: data.status,
        priority: data.priority,
        assigneeId,
        startDate: toDateOrNull(data.startDate),
        dueDate: toDateOrNull(data.dueDate),
        completedAt: data.status === "completed" ? new Date() : null,
        customFields,
        sortOrder: Date.now(),
      })
      .returning();

    await logTaskActivity(ctx, task, programId, [{ action: "created" }]);
    revalidatePath(basePath(programId, projectId));
    redirect(`${basePath(programId, projectId)}/tasks/${task.id}`);
  } catch (err) {
    return formErrorState(err);
  }
}

export async function updateTask(
  programId: string,
  projectId: string,
  taskId: string,
  formData: FormData,
): Promise<FormState> {
  // Input problems come back to the form as messages (formErrorState);
  // anything else, including the success redirect, is rethrown.
  try {
    const ctx = await requireOrgContext();

    const existing = await getTaskForProject(taskId, projectId, programId, ctx.org.id);
    if (!existing) {
      throw new Error("Task not found");
    }

    const data = parseTaskForm(formData);
    const assigneeId = await resolveOrgMemberId(data.assigneeId, ctx.org.id);
    const fieldDefs = await getTaskCustomFieldDefs(programId);
    const customFields = parseCustomFieldValues(fieldDefs, formData);

    const justCompleted = data.status === "completed" && existing.status !== "completed";
    const unCompleted = data.status !== "completed" && existing.status === "completed";
    const tracked = {
      title: data.title,
      status: data.status,
      priority: data.priority,
      assigneeId,
      startDate: toDateOrNull(data.startDate),
      dueDate: toDateOrNull(data.dueDate),
    };

    await db
      .update(tasks)
      .set({
        ...tracked,
        description: data.description ?? null,
        completedAt: justCompleted ? new Date() : unCompleted ? null : existing.completedAt,
        customFields,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));
    await logTaskActivity(ctx, { ...existing, title: data.title }, programId, await fieldChanges(existing, tracked));

    revalidatePath(basePath(programId, projectId));
    revalidatePath(`${basePath(programId, projectId)}/tasks/${taskId}`);
    redirect(`${basePath(programId, projectId)}/tasks/${taskId}`);
  } catch (err) {
    return formErrorState(err);
  }
}


/** Lightweight status-only update, used by the Board view's drag-and-drop. */
export async function updateTaskStatus(
  programId: string,
  projectId: string,
  taskId: string,
  status: string,
) {
  const ctx = await requireOrgContext();

  const existing = await getTaskForProject(taskId, projectId, programId, ctx.org.id);
  if (!existing) {
    throw new Error("Task not found");
  }

  const parsedStatus = statusSchema.parse(status);
  const justCompleted = parsedStatus === "completed" && existing.status !== "completed";
  const unCompleted = parsedStatus !== "completed" && existing.status === "completed";

  await db
    .update(tasks)
    .set({
      status: parsedStatus,
      completedAt: justCompleted ? new Date() : unCompleted ? null : existing.completedAt,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));
  await logTaskActivity(ctx, existing, programId, await fieldChanges(existing, { status: parsedStatus }));

  revalidatePath(basePath(programId, projectId));
  revalidatePath(`${basePath(programId, projectId)}/board`);
}

/** Lightweight status+order update, used by the Board view's drag-and-drop (vs. updateTaskStatus's status-only List view editor). */
export async function updateTaskOrder(
  programId: string,
  projectId: string,
  taskId: string,
  status: string,
  sortOrder: number,
) {
  const ctx = await requireOrgContext();

  const existing = await getTaskForProject(taskId, projectId, programId, ctx.org.id);
  if (!existing) {
    throw new Error("Task not found");
  }

  const parsedStatus = statusSchema.parse(status);
  const parsedSortOrder = z.number().finite().parse(sortOrder);
  const justCompleted = parsedStatus === "completed" && existing.status !== "completed";
  const unCompleted = parsedStatus !== "completed" && existing.status === "completed";

  await db
    .update(tasks)
    .set({
      status: parsedStatus,
      sortOrder: parsedSortOrder,
      completedAt: justCompleted ? new Date() : unCompleted ? null : existing.completedAt,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));
  await logTaskActivity(ctx, existing, programId, await fieldChanges(existing, { status: parsedStatus }));

  revalidatePath(basePath(programId, projectId));
  revalidatePath(`${basePath(programId, projectId)}/board`);
}


/** Lightweight priority-only update, used by the List view's inline editor. */
export async function updateTaskPriority(
  programId: string,
  projectId: string,
  taskId: string,
  priority: string,
) {
  const ctx = await requireOrgContext();

  const existing = await getTaskForProject(taskId, projectId, programId, ctx.org.id);
  if (!existing) {
    throw new Error("Task not found");
  }

  const parsedPriority = prioritySchema.parse(priority);
  await db.update(tasks).set({ priority: parsedPriority, updatedAt: new Date() }).where(eq(tasks.id, taskId));
  await logTaskActivity(ctx, existing, programId, await fieldChanges(existing, { priority: parsedPriority }));

  revalidatePath(`${basePath(programId, projectId)}/tasks`);
  revalidatePath(`${basePath(programId, projectId)}/board`);
}

/** Lightweight assignee-only update, used by the List view's inline editor. */
export async function updateTaskAssignee(
  programId: string,
  projectId: string,
  taskId: string,
  assigneeId: string,
) {
  const ctx = await requireOrgContext();

  const existing = await getTaskForProject(taskId, projectId, programId, ctx.org.id);
  if (!existing) {
    throw new Error("Task not found");
  }

  const resolvedAssigneeId = await resolveOrgMemberId(assigneeId, ctx.org.id);
  await db.update(tasks).set({ assigneeId: resolvedAssigneeId, updatedAt: new Date() }).where(eq(tasks.id, taskId));
  await logTaskActivity(ctx, existing, programId, await fieldChanges(existing, { assigneeId: resolvedAssigneeId }));

  revalidatePath(`${basePath(programId, projectId)}/tasks`);
  revalidatePath(`${basePath(programId, projectId)}/board`);
}

/** Lightweight due-date-only update, used by the List view's inline editor. */
export async function updateTaskDueDate(
  programId: string,
  projectId: string,
  taskId: string,
  dueDate: string,
) {
  const ctx = await requireOrgContext();

  const existing = await getTaskForProject(taskId, projectId, programId, ctx.org.id);
  if (!existing) {
    throw new Error("Task not found");
  }

  const parsedDueDate = toDateOrNull(dueDate);
  await db.update(tasks).set({ dueDate: parsedDueDate, updatedAt: new Date() }).where(eq(tasks.id, taskId));
  await logTaskActivity(ctx, existing, programId, await fieldChanges(existing, { dueDate: parsedDueDate }));

  revalidatePath(`${basePath(programId, projectId)}/tasks`);
  revalidatePath(`${basePath(programId, projectId)}/calendar`);
}

/**
 * Lightweight start+due date update, used by the Gantt view's drag-to-resize
 * handles. Scoped by task id alone (not pre-bound program/project ids) since
 * the hierarchical Gantt view can show tasks from many projects on one page.
 */
export async function updateTaskDates(taskId: string, startDate: string, dueDate: string) {
  const ctx = await requireOrgContext();

  const existing = await getTaskForOrg(taskId, ctx.org.id);
  if (!existing) {
    throw new Error("Task not found");
  }

  const dates = { startDate: toDateOrNull(startDate), dueDate: toDateOrNull(dueDate) };
  await db
    .update(tasks)
    .set({ ...dates, updatedAt: new Date() })
    .where(eq(tasks.id, taskId));
  await logTaskActivity(ctx, existing, existing.programId, await fieldChanges(existing, dates));
  // No revalidatePath: the Gantt already shows the new dates, and in a
  // server action revalidating re-renders the open page, re-running its whole
  // tree query on every drag. Every page is dynamic, so others are fresh on
  // the next visit.
}

export async function deleteTask(programId: string, projectId: string, taskId: string) {
  const ctx = await requireOrgContext();

  const existing = await getTaskForProject(taskId, projectId, programId, ctx.org.id);
  if (!existing) {
    throw new Error("Task not found");
  }

  await db.delete(tasks).where(eq(tasks.id, taskId));
  await logTaskActivity(ctx, existing, programId, [{ action: "deleted" }]);

  revalidatePath(basePath(programId, projectId));
  redirect(`${basePath(programId, projectId)}/tasks`);
}
