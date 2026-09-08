"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { attachments } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { getTaskForProject } from "@/lib/queries";

const taskPath = (programId: string, projectId: string, taskId: string) =>
  `/dashboard/programs/${programId}/projects/${projectId}/tasks/${taskId}`;

export async function deleteAttachment(
  programId: string,
  projectId: string,
  taskId: string,
  attachmentId: string,
) {
  const ctx = await requireOrgContext();

  const task = await getTaskForProject(taskId, projectId, programId, ctx.org.id);
  if (!task) {
    throw new Error("Task not found");
  }

  const [existing] = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.id, attachmentId), eq(attachments.taskId, taskId)))
    .limit(1);

  if (!existing) {
    throw new Error("Attachment not found");
  }
  if (existing.uploadedById !== ctx.user.id && ctx.role !== "admin") {
    throw new Error("Forbidden: only the uploader or an admin can delete this attachment");
  }

  await db.delete(attachments).where(eq(attachments.id, attachmentId));

  revalidatePath(taskPath(programId, projectId, taskId));
}
