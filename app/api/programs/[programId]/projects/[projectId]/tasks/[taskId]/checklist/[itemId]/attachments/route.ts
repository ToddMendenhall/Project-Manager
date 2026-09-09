import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { attachments } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { getChecklistItemForTask } from "@/lib/queries";
import { MAX_ATTACHMENT_SIZE_BYTES } from "@/lib/attachments";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ programId: string; projectId: string; taskId: string; itemId: string }> },
) {
  const { programId, projectId, taskId, itemId } = await params;
  const ctx = await requireOrgContext();

  const item = await getChecklistItemForTask(itemId, taskId, projectId, programId, ctx.org.id);
  if (!item) {
    return NextResponse.json({ error: "Checklist item not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    return NextResponse.json(
      { error: `File exceeds the ${MAX_ATTACHMENT_SIZE_BYTES / (1024 * 1024)}MB limit` },
      { status: 400 },
    );
  }

  const data = Buffer.from(await file.arrayBuffer());

  const [attachment] = await db
    .insert(attachments)
    .values({
      checklistItemId: itemId,
      uploadedById: ctx.user.id,
      fileName: file.name || "upload",
      contentType: file.type || null,
      sizeBytes: file.size,
      data,
    })
    .returning({ id: attachments.id });

  revalidatePath(
    `/dashboard/programs/${programId}/projects/${projectId}/tasks/${taskId}/checklist/${itemId}`,
  );

  return NextResponse.json({ ok: true, id: attachment.id }, { status: 201 });
}
