import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { whiteboards } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { getWhiteboardForOrg } from "@/lib/queries";
import { MAX_WHITEBOARD_THUMBNAIL_BYTES, sniffImageType } from "@/lib/whiteboard";

/**
 * The list page's preview image. The editor renders the canvas to a small
 * PNG after saves and POSTs it here; cards request it with
 * `?v=<thumbnailUpdatedAt>`, so the response can be cached hard — a new
 * thumbnail is a new URL.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ whiteboardId: string }> }) {
  const { whiteboardId } = await params;
  const ctx = await requireOrgContext();

  const [row] = await db
    .select({ thumbnail: whiteboards.thumbnail })
    .from(whiteboards)
    .where(and(eq(whiteboards.id, whiteboardId), eq(whiteboards.orgId, ctx.org.id)))
    .limit(1);
  if (!row?.thumbnail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(row.thumbnail), {
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(row.thumbnail.length),
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ whiteboardId: string }> }) {
  const { whiteboardId } = await params;
  const ctx = await requireOrgContext();

  const board = await getWhiteboardForOrg(whiteboardId, ctx.org.id);
  if (!board) {
    return NextResponse.json({ error: "Whiteboard not found" }, { status: 404 });
  }

  const data = Buffer.from(await request.arrayBuffer());
  if (data.length === 0 || data.length > MAX_WHITEBOARD_THUMBNAIL_BYTES || sniffImageType(data) !== "image/png") {
    return NextResponse.json({ error: "Thumbnail must be a PNG under 400KB" }, { status: 400 });
  }

  // Doesn't touch updatedAt/version: a thumbnail isn't an edit.
  await db
    .update(whiteboards)
    .set({ thumbnail: data, thumbnailUpdatedAt: new Date() })
    .where(eq(whiteboards.id, whiteboardId));

  return NextResponse.json({ ok: true });
}
