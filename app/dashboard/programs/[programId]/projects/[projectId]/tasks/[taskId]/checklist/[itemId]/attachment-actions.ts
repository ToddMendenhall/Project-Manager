"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { attachments } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { getChecklistItemForTask } from "@/lib/queries";

const itemPath = (programId: string, projectId: string, taskId: string, itemId: string) =>
  `/dashboard/programs/${programId}/projects/${projectId}/tasks/${taskId}/checklist/${itemId}`;

export async function deleteChecklistItemAttachment(
  programId: string,
  projectId: string,
  taskId: string,
  itemId: string,
  attachmentId: string,
) {
  const ctx = await requireOrgContext();

  const item = await getChecklistItemForTask(itemId, taskId, projectId, programId, ctx.org.id);
  if (!item) {
    throw new Error("Checklist item not found");
  }

  const [existing] = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.id, attachmentId), eq(attachments.checklistItemId, itemId)))
    .limit(1);

  if (!existing) {
    throw new Error("Attachment not found");
  }
  if (existing.uploadedById !== ctx.user.id && ctx.role !== "admin") {
    throw new Error("Forbidden: only the uploader or an admin can delete this attachment");
  }

  await db.delete(attachments).where(eq(attachments.id, attachmentId));

  revalidatePath(itemPath(programId, projectId, taskId, itemId));
}
