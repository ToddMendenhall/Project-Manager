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

  const attachment = await getAttachmentForOrg(attachmentId, ctx.org.id, { withData: true });
  if (!attachment?.data) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  // Attachment rows are never updated after upload, so a given id's bytes
  // never change: let the browser keep them. Whiteboard images otherwise get
  // re-streamed out of Postgres on every board open, export and thumbnail
  // render, which is what counts against the database's transfer quota.
  // `private` keeps shared caches/CDNs from storing org files; the org check
  // above still runs on every uncached request.
  return new NextResponse(new Uint8Array(attachment.data), {
    headers: {
      "Content-Type": attachment.contentType || "application/octet-stream",
      "Content-Disposition": contentDisposition(attachment.fileName),
      "Content-Length": String(attachment.data.length),
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      // Second layer under Content-Disposition: attachment. Even if a file
      // (the uploader chose its Content-Type) were ever rendered inline, it
      // runs sandboxed with no script and no access to the app's origin.
      // Images still display in <img> tags: CSP on an image response
      // doesn't block the image.
      "Content-Security-Policy": "sandbox; default-src 'none'",
    },
  });
}
