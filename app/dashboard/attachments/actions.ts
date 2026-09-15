"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { attachments } from "@/db/schema";
import { requireAdmin, requireOrgContext } from "@/lib/org";
import { getAttachmentForOrg } from "@/lib/queries";

/** Admin-only delete from the org-wide Attachments management page (as opposed to the per-task/checklist-item delete actions, which only allow the uploader or an admin). */
export async function deleteAttachmentAdmin(attachmentId: string) {
  const ctx = await requireOrgContext();
  requireAdmin(ctx);

  const existing = await getAttachmentForOrg(attachmentId, ctx.org.id);
  if (!existing) {
    throw new Error("Attachment not found");
  }

  await db.delete(attachments).where(eq(attachments.id, attachmentId));

  revalidatePath("/dashboard/attachments");
}
