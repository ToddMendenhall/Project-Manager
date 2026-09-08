"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MAX_ATTACHMENT_SIZE_BYTES, formatBytes } from "@/lib/attachments";

export function AttachmentUploadForm({
  programId,
  projectId,
  taskId,
}: {
  programId: string;
  projectId: string;
  taskId: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const file = (form.elements.namedItem("file") as HTMLInputElement)?.files?.[0];
    if (!file) return;

    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
      setError(`File exceeds the ${formatBytes(MAX_ATTACHMENT_SIZE_BYTES)} limit`);
      return;
    }

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.set("file", file);

    const res = await fetch(
      `/api/programs/${programId}/projects/${projectId}/tasks/${taskId}/attachments`,
      { method: "POST", body: formData },
    );

    setUploading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Upload failed");
      return;
    }

    formRef.current?.reset();
    router.refresh();
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex items-center gap-3">
      <input
        type="file"
        name="file"
        required
        disabled={uploading}
        className="text-sm file:mr-3 file:rounded file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm"
      />
      <button
        type="submit"
        disabled={uploading}
        className="rounded border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50"
      >
        {uploading ? "Uploading..." : "Upload"}
      </button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </form>
  );
}
