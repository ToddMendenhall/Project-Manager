import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { projects, tasks } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { getTaskCustomFieldDefs } from "@/lib/queries";
import { formatBytes } from "@/lib/attachments";
import { PriorityBadge, StatusBadge } from "@/components/status-badge";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { AttachmentUploadForm } from "@/components/attachments/attachment-upload-form";
import { deleteTask } from "../actions";
import { createComment, deleteComment } from "./comment-actions";
import { deleteAttachment } from "./attachment-actions";

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ programId: string; projectId: string; taskId: string }>;
}) {
  const { programId, projectId, taskId } = await params;
  const ctx = await requireOrgContext();

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.programId, programId)),
  });
  if (!project) notFound();

  const task = await db.query.tasks.findFirst({
    where: and(eq(tasks.id, taskId), eq(tasks.projectId, projectId)),
    with: {
      assignee: true,
      comments: {
        with: { author: true },
        orderBy: (comment, { asc }) => [asc(comment.createdAt)],
      },
      attachments: {
        with: { uploadedBy: true },
        orderBy: (attachment, { desc }) => [desc(attachment.createdAt)],
      },
    },
  });
  if (!task) notFound();

  const fieldDefs = await getTaskCustomFieldDefs(programId);
  const customValues = (task.customFields as Record<string, unknown>) ?? {};

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link
          href={`/dashboard/programs/${programId}/projects/${projectId}/tasks`}
          className="text-sm text-gray-500 underline"
        >
          &larr; {project.name} tasks
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">{task.title}</h1>
            <StatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
          </div>
          {task.description && <p className="mt-2 max-w-2xl text-sm text-gray-600">{task.description}</p>}
          <dl className="mt-3 flex flex-wrap gap-6 text-xs text-gray-500">
            {task.assignee && (
              <div>
                <dt className="font-medium text-gray-400">Assignee</dt>
                <dd>{task.assignee.name}</dd>
              </div>
            )}
            {task.dueDate && (
              <div>
                <dt className="font-medium text-gray-400">Due</dt>
                <dd>{new Date(task.dueDate).toLocaleDateString()}</dd>
              </div>
            )}
            {task.completedAt && (
              <div>
                <dt className="font-medium text-gray-400">Completed</dt>
                <dd>{new Date(task.completedAt).toLocaleDateString()}</dd>
              </div>
            )}
          </dl>
          {fieldDefs.length > 0 && (
            <dl className="mt-4 flex flex-wrap gap-6 border-t border-gray-200 pt-4 text-xs text-gray-500">
              {fieldDefs.map((def) => {
                const value = customValues[def.key];
                if (value === null || value === undefined || value === "") return null;
                return (
                  <div key={def.id}>
                    <dt className="font-medium text-gray-400">{def.label}</dt>
                    <dd>{def.fieldType === "boolean" ? (value ? "Yes" : "No") : String(value)}</dd>
                  </div>
                );
              })}
            </dl>
          )}
        </div>
        <div className="flex items-center gap-4">
          <Link
            href={`/dashboard/programs/${programId}/projects/${projectId}/tasks/${task.id}/edit`}
            className="text-sm underline"
          >
            Edit
          </Link>
          <ConfirmDeleteButton
            action={deleteTask.bind(null, programId, projectId, task.id)}
            confirmMessage={`Delete "${task.title}"? This cannot be undone.`}
          />
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Attachments ({task.attachments.length})</h2>
        <div className="mb-4">
          <AttachmentUploadForm programId={programId} projectId={projectId} taskId={task.id} />
        </div>
        {task.attachments.length === 0 ? (
          <p className="text-sm text-gray-500">No attachments yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {task.attachments.map((attachment) => (
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
                {(attachment.uploadedById === ctx.user.id || ctx.role === "admin") && (
                  <ConfirmDeleteButton
                    action={deleteAttachment.bind(null, programId, projectId, task.id, attachment.id)}
                    confirmMessage={`Delete "${attachment.fileName}"?`}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Comments ({task.comments.length})</h2>
        {task.comments.length === 0 ? (
          <p className="mb-4 text-sm text-gray-500">No comments yet.</p>
        ) : (
          <ul className="mb-4 flex flex-col gap-3">
            {task.comments.map((comment) => (
              <li key={comment.id} className="rounded border border-gray-200 bg-white p-3 text-sm">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-gray-900">{comment.author.name}</p>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">{new Date(comment.createdAt).toLocaleString()}</span>
                    {(comment.authorId === ctx.user.id || ctx.role === "admin") && (
                      <ConfirmDeleteButton
                        action={deleteComment.bind(null, programId, projectId, task.id, comment.id)}
                        confirmMessage="Delete this comment?"
                      />
                    )}
                  </div>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-gray-600">{comment.body}</p>
              </li>
            ))}
          </ul>
        )}
        <form action={createComment.bind(null, programId, projectId, task.id)} className="flex flex-col gap-2">
          <textarea
            name="body"
            required
            placeholder="Add a comment..."
            className="min-h-[80px] rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <button type="submit" className="w-fit rounded bg-gray-900 px-4 py-2 text-sm text-white">
            Comment
          </button>
        </form>
      </div>
    </div>
  );
}
