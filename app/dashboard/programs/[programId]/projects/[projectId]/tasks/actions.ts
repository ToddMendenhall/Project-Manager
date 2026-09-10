"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { getProjectForProgram, getTaskCustomFieldDefs, getTaskForProject } from "@/lib/queries";
import { parseCustomFieldValues } from "@/lib/custom-fields";

// Tasks are the day-to-day work items — unlike Program/Project structure,
// any org member (not just admins) can create, edit, or delete them.

const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

const taskSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(500),
  description: z.preprocess(emptyToUndefined, z.string().trim().max(5000).optional()),
  status: z.enum(["not_started", "in_progress", "blocked", "completed", "cancelled"]),
  priority: z.enum(["low", "medium", "high", "urgent"]),
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
  `/dashboard/programs/${programId}/projects/${projectId}`;

export async function createTask(programId: string, projectId: string, formData: FormData) {
  const ctx = await requireOrgContext();

  const project = await getProjectForProgram(projectId, programId, ctx.org.id);
  if (!project) {
    throw new Error("Project not found");
  }

  const data = parseTaskForm(formData);
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
      assigneeId: data.assigneeId ?? null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      completedAt: data.status === "completed" ? new Date() : null,
      customFields,
    })
    .returning();

  revalidatePath(basePath(programId, projectId));
  redirect(`${basePath(programId, projectId)}/tasks/${task.id}`);
}

export async function updateTask(
  programId: string,
  projectId: string,
  taskId: string,
  formData: FormData,
) {
  const ctx = await requireOrgContext();

  const existing = await getTaskForProject(taskId, projectId, programId, ctx.org.id);
  if (!existing) {
    throw new Error("Task not found");
  }

  const data = parseTaskForm(formData);
  const fieldDefs = await getTaskCustomFieldDefs(programId);
  const customFields = parseCustomFieldValues(fieldDefs, formData);

  const justCompleted = data.status === "completed" && existing.status !== "completed";
  const unCompleted = data.status !== "completed" && existing.status === "completed";

  await db
    .update(tasks)
    .set({
      title: data.title,
      description: data.description ?? null,
      status: data.status,
      priority: data.priority,
      assigneeId: data.assigneeId ?? null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      completedAt: justCompleted ? new Date() : unCompleted ? null : existing.completedAt,
      customFields,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));

  revalidatePath(basePath(programId, projectId));
  revalidatePath(`${basePath(programId, projectId)}/tasks/${taskId}`);
  redirect(`${basePath(programId, projectId)}/tasks/${taskId}`);
}

const statusEnum = z.enum(["not_started", "in_progress", "blocked", "completed", "cancelled"]);

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

  const parsedStatus = statusEnum.parse(status);
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

  revalidatePath(basePath(programId, projectId));
  revalidatePath(`${basePath(programId, projectId)}/board`);
}

const priorityEnum = z.enum(["low", "medium", "high", "urgent"]);

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

  await db
    .update(tasks)
    .set({ priority: priorityEnum.parse(priority), updatedAt: new Date() })
    .where(eq(tasks.id, taskId));

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

  await db
    .update(tasks)
    .set({ assigneeId: assigneeId ? z.string().uuid().parse(assigneeId) : null, updatedAt: new Date() })
    .where(eq(tasks.id, taskId));

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

  await db
    .update(tasks)
    .set({ dueDate: dueDate ? new Date(dueDate) : null, updatedAt: new Date() })
    .where(eq(tasks.id, taskId));

  revalidatePath(`${basePath(programId, projectId)}/tasks`);
  revalidatePath(`${basePath(programId, projectId)}/calendar`);
}

export async function deleteTask(programId: string, projectId: string, taskId: string) {
  const ctx = await requireOrgContext();

  const existing = await getTaskForProject(taskId, projectId, programId, ctx.org.id);
  if (!existing) {
    throw new Error("Task not found");
  }

  await db.delete(tasks).where(eq(tasks.id, taskId));

  revalidatePath(basePath(programId, projectId));
  redirect(`${basePath(programId, projectId)}/tasks`);
}
