import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { projects, tasks } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { getTaskCustomFieldDefs } from "@/lib/queries";
import { PriorityBadge, StatusBadge } from "@/components/status-badge";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { deleteTask } from "../actions";

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
    with: { assignee: true },
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
    </div>
  );
}
