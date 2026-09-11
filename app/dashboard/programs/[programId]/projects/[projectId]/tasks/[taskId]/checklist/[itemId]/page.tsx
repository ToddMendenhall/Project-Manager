import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { checklistItems, programs, projects, tasks } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { getOrgMembers } from "@/lib/queries";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { Breadcrumbs } from "@/components/views/breadcrumbs";
import { checklistItemBreadcrumbs } from "@/lib/breadcrumbs";
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

  const program = await db.query.programs.findFirst({
    where: and(eq(programs.id, programId), eq(programs.orgId, ctx.org.id)),
    with: { portfolio: true },
  });
  if (!program) notFound();

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
      // Restricted to id/name — CommentSection is a Client Component, and
      // Server->Client props are serialized to the browser as-is, so an
      // unrestricted `author` here would ship the bcrypt hash to any org
      // member who opens this page. (`assignee` is unused below; only
      // item.assigneeId, a plain scalar column, is — dropped rather than
      // restricted since ChecklistItemForm never reads the relation.)
      comments: {
        with: { author: { columns: { id: true, name: true } } },
        orderBy: (comment, { asc }) => [asc(comment.createdAt)],
      },
      attachments: {
        with: { uploadedBy: { columns: { id: true, name: true } } },
        orderBy: (attachment, { desc }) => [desc(attachment.createdAt)],
      },
    },
  });
  if (!item) notFound();

  const members = await getOrgMembers(ctx.org.id);

  return (
    <div className="flex flex-col gap-8">
      <Breadcrumbs items={checklistItemBreadcrumbs(program, project, task)} />

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
