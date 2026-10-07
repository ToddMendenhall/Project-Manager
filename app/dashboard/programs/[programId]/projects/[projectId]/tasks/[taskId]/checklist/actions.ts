"use server";

import { z } from "zod";
import { prioritySchema, statusSchema } from "@/lib/field-schemas";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { checklistItems } from "@/db/schema";
import { toDateOrNull } from "@/lib/dates";
import { requireOrgContext } from "@/lib/org";
import { getChecklistItemForTask, getTaskForProject, resolveOrgMemberId } from "@/lib/queries";
import { fieldChanges, logActivity } from "@/lib/activity";
import { formErrorState } from "@/lib/form-errors";
import type { FormState } from "@/lib/form-state";
import { checklistItemPath, projectPath, taskPath } from "@/lib/paths";

// Checklist items follow the same permission model as tasks — any org
// member (not just admins) can create, edit, or delete them.

const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

const checklistItemSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(500),
  description: z.preprocess(emptyToUndefined, z.string().trim().max(5000).optional()),
  status: statusSchema,
  priority: prioritySchema,
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

const listPath = (programId: string, projectId: string) =>
  `${projectPath(programId, projectId)}/tasks`;

/** Records a checklist item event in its task's (and so its project's and program's) history. */
async function logItemActivity(
  ctx: { user: { id: string }; org: { id: string } },
  ids: { programId: string; projectId: string; taskId: string },
  item: { id: string; title: string },
  events: Parameters<typeof logActivity>[3],
) {
  await logActivity(
    ctx.user.id,
    { orgId: ctx.org.id, ...ids },
    { type: "checklist_item", id: item.id, name: item.title },
    events,
  );
}

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

  const [item] = await db.insert(checklistItems).values({ taskId, title }).returning();
  await logItemActivity(ctx, { programId, projectId, taskId }, item, [{ action: "created" }]);

  revalidatePath(taskPath(programId, projectId, taskId));
}

export async function updateChecklistItem(
  programId: string,
  projectId: string,
  taskId: string,
  itemId: string,
  formData: FormData,
): Promise<FormState> {
  // Input problems come back to the form as messages (formErrorState);
  // anything else, including the success redirect, is rethrown.
  try {
    const ctx = await requireOrgContext();

    const existing = await getChecklistItemForTask(itemId, taskId, projectId, programId, ctx.org.id);
    if (!existing) {
      throw new Error("Checklist item not found");
    }

    const data = parseChecklistItemForm(formData);
    const assigneeId = await resolveOrgMemberId(data.assigneeId, ctx.org.id);

    const justCompleted = data.status === "completed" && existing.status !== "completed";
    const unCompleted = data.status !== "completed" && existing.status === "completed";

    const tracked = {
      title: data.title,
      status: data.status,
      priority: data.priority,
      assigneeId,
      dueDate: toDateOrNull(data.dueDate),
    };
    await db
      .update(checklistItems)
      .set({
        ...tracked,
        description: data.description ?? null,
        completedAt: justCompleted ? new Date() : unCompleted ? null : existing.completedAt,
        updatedAt: new Date(),
      })
      .where(eq(checklistItems.id, itemId));
    await logItemActivity(
      ctx,
      { programId, projectId, taskId },
      { id: itemId, title: data.title },
      await fieldChanges(existing, tracked),
    );

    revalidatePath(taskPath(programId, projectId, taskId));
    revalidatePath(checklistItemPath(programId, projectId, taskId, itemId));
    redirect(checklistItemPath(programId, projectId, taskId, itemId));
  } catch (err) {
    return formErrorState(err);
  }
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

  const status = checked ? "completed" : "not_started";
  await db
    .update(checklistItems)
    .set({ status, completedAt: checked ? new Date() : null, updatedAt: new Date() })
    .where(eq(checklistItems.id, itemId));
  await logItemActivity(ctx, { programId, projectId, taskId }, existing, await fieldChanges(existing, { status }));

  revalidatePath(taskPath(programId, projectId, taskId));
  revalidatePath(checklistItemPath(programId, projectId, taskId, itemId));
}


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

  const parsedStatus = statusSchema.parse(status);
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
  await logItemActivity(
    ctx,
    { programId, projectId, taskId },
    existing,
    await fieldChanges(existing, { status: parsedStatus }),
  );

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

  const parsedPriority = prioritySchema.parse(priority);
  await db
    .update(checklistItems)
    .set({ priority: parsedPriority, updatedAt: new Date() })
    .where(eq(checklistItems.id, itemId));
  await logItemActivity(
    ctx,
    { programId, projectId, taskId },
    existing,
    await fieldChanges(existing, { priority: parsedPriority }),
  );

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

  const resolvedAssigneeId = await resolveOrgMemberId(assigneeId, ctx.org.id);
  await db
    .update(checklistItems)
    .set({ assigneeId: resolvedAssigneeId, updatedAt: new Date() })
    .where(eq(checklistItems.id, itemId));
  await logItemActivity(
    ctx,
    { programId, projectId, taskId },
    existing,
    await fieldChanges(existing, { assigneeId: resolvedAssigneeId }),
  );

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

  const parsedDueDate = toDateOrNull(dueDate);
  await db
    .update(checklistItems)
    .set({ dueDate: parsedDueDate, updatedAt: new Date() })
    .where(eq(checklistItems.id, itemId));
  await logItemActivity(
    ctx,
    { programId, projectId, taskId },
    existing,
    await fieldChanges(existing, { dueDate: parsedDueDate }),
  );

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
  await logItemActivity(ctx, { programId, projectId, taskId }, existing, [{ action: "deleted" }]);

  // Redirects to the task (not just revalidates) because this same action
  // is used from the item's own detail page, which would otherwise 404 on
  // its next render once the item it's displaying no longer exists.
  revalidatePath(taskPath(programId, projectId, taskId));
  redirect(taskPath(programId, projectId, taskId));
}
