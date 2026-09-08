"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { comments } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { getTaskForProject } from "@/lib/queries";

const commentSchema = z.object({
  body: z.string().trim().min(1, "Comment can't be empty").max(5000),
});

const taskPath = (programId: string, projectId: string, taskId: string) =>
  `/dashboard/programs/${programId}/projects/${projectId}/tasks/${taskId}`;

export async function createComment(
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

  const { body } = commentSchema.parse({ body: formData.get("body") });

  await db.insert(comments).values({
    taskId,
    authorId: ctx.user.id,
    body,
  });

  revalidatePath(taskPath(programId, projectId, taskId));
}

export async function deleteComment(
  programId: string,
  projectId: string,
  taskId: string,
  commentId: string,
) {
  const ctx = await requireOrgContext();

  const task = await getTaskForProject(taskId, projectId, programId, ctx.org.id);
  if (!task) {
    throw new Error("Task not found");
  }

  const [existing] = await db
    .select()
    .from(comments)
    .where(and(eq(comments.id, commentId), eq(comments.taskId, taskId)))
    .limit(1);

  if (!existing) {
    throw new Error("Comment not found");
  }
  if (existing.authorId !== ctx.user.id && ctx.role !== "admin") {
    throw new Error("Forbidden: only the author or an admin can delete this comment");
  }

  await db.delete(comments).where(eq(comments.id, commentId));

  revalidatePath(taskPath(programId, projectId, taskId));
}
