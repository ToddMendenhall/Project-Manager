// Kept well under Vercel's serverless function request-body limit (4.5MB)
// since attachments are stored directly in Postgres for phase 1.
export const MAX_ATTACHMENT_SIZE_BYTES = 4 * 1024 * 1024;

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
