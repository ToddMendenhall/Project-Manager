import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { projects, tasks } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { getTaskCustomFieldDefs } from "@/lib/queries";
import { PriorityBadge, StatusBadge } from "@/components/status-badge";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { CommentSection } from "@/components/comments/comment-section";
import { AttachmentSection } from "@/components/attachments/attachment-section";
import { ChecklistWidget } from "@/components/tasks/checklist-widget";
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
      // Restricted to id/name everywhere below (never the full user row,
      // e.g. passwordHash) — ChecklistWidget and CommentSection are Client
      // Components, and Server->Client props are serialized to the browser
      // as-is, so an unrestricted `assignee`/`author` here would ship the
      // bcrypt hash to any org member who opens this page.
      assignee: { columns: { id: true, name: true } },
      checklistItems: {
        with: { assignee: { columns: { id: true, name: true } } },
        orderBy: (item, { asc }) => [asc(item.createdAt)],
      },
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
            {task.startDate && (
              <div>
                <dt className="font-medium text-gray-400">Start</dt>
                <dd>{new Date(task.startDate).toLocaleDateString()}</dd>
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

      <ChecklistWidget
        programId={programId}
        projectId={projectId}
        taskId={task.id}
        initialItems={task.checklistItems}
      />

      <AttachmentSection
        attachments={task.attachments}
        uploadUrl={`/api/programs/${programId}/projects/${projectId}/tasks/${task.id}/attachments`}
        deleteAction={deleteAttachment.bind(null, programId, projectId, task.id)}
        currentUserId={ctx.user.id}
        isAdmin={ctx.role === "admin"}
      />

      <CommentSection
        comments={task.comments}
        createAction={createComment.bind(null, programId, projectId, task.id)}
        deleteAction={deleteComment.bind(null, programId, projectId, task.id)}
        currentUserId={ctx.user.id}
        isAdmin={ctx.role === "admin"}
      />
    </div>
  );
}
