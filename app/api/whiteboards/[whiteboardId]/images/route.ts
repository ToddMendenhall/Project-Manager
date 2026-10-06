import { NextResponse } from "next/server";
import { db } from "@/db";
import { attachments } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { getWhiteboardForOrg } from "@/lib/queries";
import { MAX_WHITEBOARD_IMAGE_BYTES, sniffImageType } from "@/lib/whiteboard";

/**
 * Uploads an image for a whiteboard canvas. The bytes become an
 * attachments row parented by the whiteboard (deleted with it); the
 * editor then saves an image node referencing the returned id. Called via
 * client-side fetch, like the task attachment uploads.
 */
export async function POST(request: Request, { params }: { params: Promise<{ whiteboardId: string }> }) {
  const { whiteboardId } = await params;
  const ctx = await requireOrgContext();

  const board = await getWhiteboardForOrg(whiteboardId, ctx.org.id);
  if (!board) {
    return NextResponse.json({ error: "Whiteboard not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size > MAX_WHITEBOARD_IMAGE_BYTES) {
    return NextResponse.json(
      { error: `Images must be under ${MAX_WHITEBOARD_IMAGE_BYTES / (1024 * 1024)}MB` },
      { status: 400 },
    );
  }

  const data = Buffer.from(await file.arrayBuffer());
  const contentType = sniffImageType(data);
  if (!contentType) {
    return NextResponse.json({ error: "Only PNG, JPEG, GIF and WebP images can be added" }, { status: 400 });
  }

  const [attachment] = await db
    .insert(attachments)
    .values({
      whiteboardId,
      uploadedById: ctx.user.id,
      fileName: file.name || "image",
      contentType,
      sizeBytes: file.size,
      data,
    })
    .returning({ id: attachments.id });

  return NextResponse.json({ ok: true, id: attachment.id }, { status: 201 });
}
