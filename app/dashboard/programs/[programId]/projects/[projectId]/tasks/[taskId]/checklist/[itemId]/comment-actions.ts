"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { comments } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { getChecklistItemForTask } from "@/lib/queries";

const commentSchema = z.object({
  body: z.string().trim().min(1, "Comment can't be empty").max(5000),
});

const itemPath = (programId: string, projectId: string, taskId: string, itemId: string) =>
  `/dashboard/programs/${programId}/projects/${projectId}/tasks/${taskId}/checklist/${itemId}`;

export async function createChecklistItemComment(
  programId: string,
  projectId: string,
  taskId: string,
  itemId: string,
  formData: FormData,
) {
  const ctx = await requireOrgContext();

  const item = await getChecklistItemForTask(itemId, taskId, projectId, programId, ctx.org.id);
  if (!item) {
    throw new Error("Checklist item not found");
  }

  const { body } = commentSchema.parse({ body: formData.get("body") });

  await db.insert(comments).values({
    checklistItemId: itemId,
    authorId: ctx.user.id,
    body,
  });

  revalidatePath(itemPath(programId, projectId, taskId, itemId));
}

export async function deleteChecklistItemComment(
  programId: string,
  projectId: string,
  taskId: string,
  itemId: string,
  commentId: string,
) {
  const ctx = await requireOrgContext();

  const item = await getChecklistItemForTask(itemId, taskId, projectId, programId, ctx.org.id);
  if (!item) {
    throw new Error("Checklist item not found");
  }

  const [existing] = await db
    .select()
    .from(comments)
    .where(and(eq(comments.id, commentId), eq(comments.checklistItemId, itemId)))
    .limit(1);

  if (!existing) {
    throw new Error("Comment not found");
  }
  if (existing.authorId !== ctx.user.id && ctx.role !== "admin") {
    throw new Error("Forbidden: only the author or an admin can delete this comment");
  }

  await db.delete(comments).where(eq(comments.id, commentId));

  revalidatePath(itemPath(programId, projectId, taskId, itemId));
}
