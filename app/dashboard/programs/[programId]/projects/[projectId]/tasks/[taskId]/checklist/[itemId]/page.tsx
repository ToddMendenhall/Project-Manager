import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { checklistItems, projects, tasks } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { PriorityBadge, StatusBadge } from "@/components/status-badge";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { CommentSection } from "@/components/comments/comment-section";
import { AttachmentSection } from "@/components/attachments/attachment-section";
import { deleteChecklistItem } from "../actions";
import { createChecklistItemComment, deleteChecklistItemComment } from "./comment-actions";
import { deleteChecklistItemAttachment } from "./attachment-actions";

export default async function ChecklistItemDetailPage({
  params,
}: {
  params: Promise<{ programId: string; projectId: string; taskId: string; itemId: string }>;
}) {
  const { programId, projectId, taskId, itemId } = await params;
  const ctx = await requireOrgContext();

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.programId, programId)),
  });
  if (!project) notFound();

  const task = await db.query.tasks.findFirst({
    where: and(eq(tasks.id, taskId), eq(tasks.projectId, projectId)),
  });
  if (!task) notFound();

  const item = await db.query.checklistItems.findFirst({
    where: and(eq(checklistItems.id, itemId), eq(checklistItems.taskId, taskId)),
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
  if (!item) notFound();

  const taskPath = `/dashboard/programs/${programId}/projects/${projectId}/tasks/${taskId}`;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href={taskPath} className="text-sm text-gray-500 underline">
          &larr; {task.title}
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">{item.title}</h1>
            <StatusBadge status={item.status} />
            <PriorityBadge priority={item.priority} />
          </div>
          {item.description && <p className="mt-2 max-w-2xl text-sm text-gray-600">{item.description}</p>}
          <dl className="mt-3 flex flex-wrap gap-6 text-xs text-gray-500">
            {item.assignee && (
              <div>
                <dt className="font-medium text-gray-400">Assignee</dt>
                <dd>{item.assignee.name}</dd>
              </div>
            )}
            {item.dueDate && (
              <div>
                <dt className="font-medium text-gray-400">Due</dt>
                <dd>{new Date(item.dueDate).toLocaleDateString()}</dd>
              </div>
            )}
            {item.completedAt && (
              <div>
                <dt className="font-medium text-gray-400">Completed</dt>
                <dd>{new Date(item.completedAt).toLocaleDateString()}</dd>
              </div>
            )}
          </dl>
        </div>
        <div className="flex items-center gap-4">
          <Link href={`${taskPath}/checklist/${item.id}/edit`} className="text-sm underline">
            Edit
          </Link>
          <ConfirmDeleteButton
            action={deleteChecklistItem.bind(null, programId, projectId, taskId, item.id)}
            confirmMessage={`Delete "${item.title}"? This cannot be undone.`}
          />
        </div>
      </div>

      <AttachmentSection
        attachments={item.attachments}
        uploadUrl={`/api/programs/${programId}/projects/${projectId}/tasks/${taskId}/checklist/${item.id}/attachments`}
        deleteAction={deleteChecklistItemAttachment.bind(null, programId, projectId, taskId, item.id)}
        currentUserId={ctx.user.id}
        isAdmin={ctx.role === "admin"}
      />

      <CommentSection
        comments={item.comments}
        createAction={createChecklistItemComment.bind(null, programId, projectId, taskId, item.id)}
        deleteAction={deleteChecklistItemComment.bind(null, programId, projectId, taskId, item.id)}
        currentUserId={ctx.user.id}
        isAdmin={ctx.role === "admin"}
      />
    </div>
  );
}
