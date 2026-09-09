import { formatBytes } from "@/lib/attachments";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { AttachmentUploadForm } from "./attachment-upload-form";

type AttachmentWithUploader = {
  id: string;
  fileName: string;
  sizeBytes: number | null;
  createdAt: Date;
  uploadedById: string;
  uploadedBy: { name: string };
};

/** Renders a task's or checklist item's attachment list + upload form. Both callers bind their own upload URL / delete action to the right parent id. */
export function AttachmentSection({
  attachments,
  uploadUrl,
  deleteAction,
  currentUserId,
  isAdmin,
}: {
  attachments: AttachmentWithUploader[];
  uploadUrl: string;
  deleteAction: (attachmentId: string) => Promise<void>;
  currentUserId: string;
  isAdmin: boolean;
}) {
  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">Attachments ({attachments.length})</h2>
      <div className="mb-4">
        <AttachmentUploadForm uploadUrl={uploadUrl} />
      </div>
      {attachments.length === 0 ? (
        <p className="text-sm text-gray-500">No attachments yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              className="flex items-center justify-between rounded border border-gray-200 bg-white p-3 text-sm"
            >
              <div>
                <a
                  href={`/api/attachments/${attachment.id}`}
                  className="font-medium text-gray-900 hover:underline"
                >
                  {attachment.fileName}
                </a>
                <p className="text-xs text-gray-400">
                  {attachment.sizeBytes != null && `${formatBytes(attachment.sizeBytes)} · `}
                  {attachment.uploadedBy.name} &middot; {new Date(attachment.createdAt).toLocaleDateString()}
                </p>
              </div>
              {(attachment.uploadedById === currentUserId || isAdmin) && (
                <ConfirmDeleteButton
                  action={deleteAction.bind(null, attachment.id)}
                  confirmMessage={`Delete "${attachment.fileName}"?`}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
