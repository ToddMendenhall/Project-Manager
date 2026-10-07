// Kept well under Vercel's serverless function request-body limit (4.5MB)
// since attachments are stored directly in Postgres for phase 1.
export const MAX_ATTACHMENT_SIZE_BYTES = 4 * 1024 * 1024;

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Room for the multipart envelope (boundaries, headers) around the file itself. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

/**
 * True when a request declares a body bigger than `limit` allows, so an
 * upload route can refuse it before `request.formData()` buffers the whole
 * thing in memory. Vercel caps bodies at 4.5MB anyway; a self-hosted server
 * has no cap, so this is what stops a huge upload from exhausting memory.
 * (A body without Content-Length still gets the per-file size check after
 * parsing.)
 */
export function declaresBodyOver(request: Request, limit: number): boolean {
  const length = Number(request.headers.get("content-length"));
  return Number.isFinite(length) && length > limit + MULTIPART_OVERHEAD_BYTES;
}

/** A file name that fits `attachments.file_name` (varchar 255), keeping a short extension. */
export function storableFileName(name: string, fallback: string): string {
  const trimmed = name.trim() || fallback;
  if (trimmed.length <= 255) return trimmed;
  const dot = trimmed.lastIndexOf(".");
  const ext = dot > 0 && trimmed.length - dot <= 16 ? trimmed.slice(dot) : "";
  return trimmed.slice(0, 255 - ext.length) + ext;
}
