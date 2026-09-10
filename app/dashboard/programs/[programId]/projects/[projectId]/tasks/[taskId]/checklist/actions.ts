"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { checklistItems } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { getChecklistItemForTask, getTaskForProject } from "@/lib/queries";

// Checklist items follow the same permission model as tasks — any org
// member (not just admins) can create, edit, or delete them.

const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

const checklistItemSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(500),
  description: z.preprocess(emptyToUndefined, z.string().trim().max(5000).optional()),
  status: z.enum(["not_started", "in_progress", "blocked", "completed", "cancelled"]),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  assigneeId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  dueDate: z.preprocess(emptyToUndefined, z.string().optional()),
});

function parseChecklistItemForm(formData: FormData) {
  return checklistItemSchema.parse({
    title: formData.get("title"),
    description: formData.get("description"),
    status: formData.get("status") ?? "not_started",
    priority: formData.get("priority") ?? "medium",
    assigneeId: formData.get("assigneeId"),
    dueDate: formData.get("dueDate"),
  });
}

const taskPath = (programId: string, projectId: string, taskId: string) =>
  `/dashboard/programs/${programId}/projects/${projectId}/tasks/${taskId}`;

const itemPath = (programId: string, projectId: string, taskId: string, itemId: string) =>
  `${taskPath(programId, projectId, taskId)}/checklist/${itemId}`;

const listPath = (programId: string, projectId: string) =>
  `/dashboard/programs/${programId}/projects/${projectId}/tasks`;

/** Quick-add: only a title is required — the rest is filled in from the item's own detail page. */
export async function createChecklistItem(
  programId: string,
  projectId: string,
  taskId: string,
  formData: FormData,
) {
  const ctx = await requireOrgContext();

  const task = await getTaskForProject(taskId, projectId, programId, ctx.org.id);
  if (!task) {
    throw new Error("Task not found");
  }

  const title = z.string().trim().min(1).max(500).parse(formData.get("title"));

  await db.insert(checklistItems).values({ taskId, title });

  revalidatePath(taskPath(programId, projectId, taskId));
}

export async function updateChecklistItem(
  programId: string,
  projectId: string,
  taskId: string,
  itemId: string,
  formData: FormData,
) {
  const ctx = await requireOrgContext();

  const existing = await getChecklistItemForTask(itemId, taskId, projectId, programId, ctx.org.id);
  if (!existing) {
    throw new Error("Checklist item not found");
  }

  const data = parseChecklistItemForm(formData);

  const justCompleted = data.status === "completed" && existing.status !== "completed";
  const unCompleted = data.status !== "completed" && existing.status === "completed";

  await db
    .update(checklistItems)
    .set({
      title: data.title,
      description: data.description ?? null,
      status: data.status,
      priority: data.priority,
      assigneeId: data.assigneeId ?? null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      completedAt: justCompleted ? new Date() : unCompleted ? null : existing.completedAt,
      updatedAt: new Date(),
    })
    .where(eq(checklistItems.id, itemId));

  revalidatePath(taskPath(programId, projectId, taskId));
  revalidatePath(itemPath(programId, projectId, taskId, itemId));
  redirect(itemPath(programId, projectId, taskId, itemId));
}

/** Lightweight status-only update, used by the checklist checkbox. */
export async function toggleChecklistItem(
  programId: string,
  projectId: string,
  taskId: string,
  itemId: string,
  checked: boolean,
) {
  const ctx = await requireOrgContext();

  const existing = await getChecklistItemForTask(itemId, taskId, projectId, programId, ctx.org.id);
  if (!existing) {
    throw new Error("Checklist item not found");
  }

  await db
    .update(checklistItems)
    .set({
      status: checked ? "completed" : "not_started",
      completedAt: checked ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(checklistItems.id, itemId));

  revalidatePath(taskPath(programId, projectId, taskId));
  revalidatePath(itemPath(programId, projectId, taskId, itemId));
}

const statusEnum = z.enum(["not_started", "in_progress", "blocked", "completed", "cancelled"]);
const priorityEnum = z.enum(["low", "medium", "high", "urgent"]);

/** Lightweight status-only update, used by the List view's inline editor (vs. toggleChecklistItem's checkbox). */
export async function updateChecklistItemStatus(
  programId: string,
  projectId: string,
  taskId: string,
  itemId: string,
  status: string,
) {
  const ctx = await requireOrgContext();

  const existing = await getChecklistItemForTask(itemId, taskId, projectId, programId, ctx.org.id);
  if (!existing) {
    throw new Error("Checklist item not found");
  }

  const parsedStatus = statusEnum.parse(status);
  const justCompleted = parsedStatus === "completed" && existing.status !== "completed";
  const unCompleted = parsedStatus !== "completed" && existing.status === "completed";

  await db
    .update(checklistItems)
    .set({
      status: parsedStatus,
      completedAt: justCompleted ? new Date() : unCompleted ? null : existing.completedAt,
      updatedAt: new Date(),
    })
    .where(eq(checklistItems.id, itemId));

  revalidatePath(listPath(programId, projectId));
}

/** Lightweight priority-only update, used by the List view's inline editor. */
export async function updateChecklistItemPriority(
  programId: string,
  projectId: string,
  taskId: string,
  itemId: string,
  priority: string,
) {
  const ctx = await requireOrgContext();

  const existing = await getChecklistItemForTask(itemId, taskId, projectId, programId, ctx.org.id);
  if (!existing) {
    throw new Error("Checklist item not found");
  }

  await db
    .update(checklistItems)
    .set({ priority: priorityEnum.parse(priority), updatedAt: new Date() })
    .where(eq(checklistItems.id, itemId));

  revalidatePath(listPath(programId, projectId));
}

/** Lightweight assignee-only update, used by the List view's inline editor. */
export async function updateChecklistItemAssignee(
  programId: string,
  projectId: string,
  taskId: string,
  itemId: string,
  assigneeId: string,
) {
  const ctx = await requireOrgContext();

  const existing = await getChecklistItemForTask(itemId, taskId, projectId, programId, ctx.org.id);
  if (!existing) {
    throw new Error("Checklist item not found");
  }

  await db
    .update(checklistItems)
    .set({ assigneeId: assigneeId ? z.string().uuid().parse(assigneeId) : null, updatedAt: new Date() })
    .where(eq(checklistItems.id, itemId));

  revalidatePath(listPath(programId, projectId));
}

/** Lightweight due-date-only update, used by the List view's inline editor. */
export async function updateChecklistItemDueDate(
  programId: string,
  projectId: string,
  taskId: string,
  itemId: string,
  dueDate: string,
) {
  const ctx = await requireOrgContext();

  const existing = await getChecklistItemForTask(itemId, taskId, projectId, programId, ctx.org.id);
  if (!existing) {
    throw new Error("Checklist item not found");
  }

  await db
    .update(checklistItems)
    .set({ dueDate: dueDate ? new Date(dueDate) : null, updatedAt: new Date() })
    .where(eq(checklistItems.id, itemId));

  revalidatePath(listPath(programId, projectId));
}

export async function deleteChecklistItem(
  programId: string,
  projectId: string,
  taskId: string,
  itemId: string,
) {
  const ctx = await requireOrgContext();

  const existing = await getChecklistItemForTask(itemId, taskId, projectId, programId, ctx.org.id);
  if (!existing) {
    throw new Error("Checklist item not found");
  }

  await db.delete(checklistItems).where(eq(checklistItems.id, itemId));

  // Redirects to the task (not just revalidates) because this same action
  // is used from the item's own detail page, which would otherwise 404 on
  // its next render once the item it's displaying no longer exists.
  revalidatePath(taskPath(programId, projectId, taskId));
  redirect(taskPath(programId, projectId, taskId));
}
