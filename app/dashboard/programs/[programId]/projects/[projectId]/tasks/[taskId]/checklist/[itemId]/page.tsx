import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { checklistItems, projects, tasks } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { getOrgMembers } from "@/lib/queries";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { CommentSection } from "@/components/comments/comment-section";
import { AttachmentSection } from "@/components/attachments/attachment-section";
import { ChecklistItemForm } from "@/components/tasks/checklist-item-form";
import { deleteChecklistItem, updateChecklistItem } from "../actions";
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

  const members = await getOrgMembers(ctx.org.id);
  const taskPath = `/dashboard/programs/${programId}/projects/${projectId}/tasks/${taskId}`;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href={taskPath} className="text-sm text-gray-500 underline">
          &larr; {task.title}
        </Link>
      </div>

      <div className="flex items-start justify-between gap-6">
        <ChecklistItemForm
          action={updateChecklistItem.bind(null, programId, projectId, taskId, item.id)}
          item={item}
          orgMembers={members}
          submitLabel="Save changes"
        />
        <ConfirmDeleteButton
          action={deleteChecklistItem.bind(null, programId, projectId, taskId, item.id)}
          confirmMessage={`Delete "${item.title}"? This cannot be undone.`}
        />
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
