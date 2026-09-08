import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/org";
import { getAttachmentForOrg } from "@/lib/queries";

function contentDisposition(fileName: string) {
  const asciiName = fileName.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'");
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  const { attachmentId } = await params;
  const ctx = await requireOrgContext();

  const attachment = await getAttachmentForOrg(attachmentId, ctx.org.id);
  if (!attachment) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(attachment.data), {
    headers: {
      "Content-Type": attachment.contentType || "application/octet-stream",
      "Content-Disposition": contentDisposition(attachment.fileName),
      "Content-Length": String(attachment.data.length),
      "Cache-Control": "private, no-store",
    },
  });
}
