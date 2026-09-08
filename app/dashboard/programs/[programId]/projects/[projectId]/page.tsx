import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { programs, projects } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { PriorityBadge, StatusBadge } from "@/components/status-badge";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { deleteProject } from "../actions";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ programId: string; projectId: string }>;
}) {
  const { programId, projectId } = await params;
  const ctx = await requireOrgContext();

  const program = await db.query.programs.findFirst({
    where: and(eq(programs.id, programId), eq(programs.orgId, ctx.org.id)),
  });
  if (!program) notFound();

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.programId, programId)),
    with: {
      lead: true,
      tasks: { orderBy: (task, { desc }) => [desc(task.createdAt)] },
    },
  });
  if (!project) notFound();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href={`/dashboard/programs/${program.id}`} className="text-sm text-gray-500 underline">
          &larr; {program.name}
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">{project.name}</h1>
            <StatusBadge status={project.status} />
            <PriorityBadge priority={project.priority} />
          </div>
          {project.description && (
            <p className="mt-2 max-w-2xl text-sm text-gray-600">{project.description}</p>
          )}
          <dl className="mt-3 flex gap-6 text-xs text-gray-500">
            {project.lead && (
              <div>
                <dt className="font-medium text-gray-400">Lead</dt>
                <dd>{project.lead.name}</dd>
              </div>
            )}
            {project.startDate && (
              <div>
                <dt className="font-medium text-gray-400">Start</dt>
                <dd>{new Date(project.startDate).toLocaleDateString()}</dd>
              </div>
            )}
            {project.dueDate && (
              <div>
                <dt className="font-medium text-gray-400">Due</dt>
                <dd>{new Date(project.dueDate).toLocaleDateString()}</dd>
              </div>
            )}
          </dl>
        </div>
        {ctx.role === "admin" && (
          <div className="flex items-center gap-4">
            <Link
              href={`/dashboard/programs/${programId}/projects/${project.id}/edit`}
              className="text-sm underline"
            >
              Edit
            </Link>
            <ConfirmDeleteButton
              action={deleteProject.bind(null, programId, project.id)}
              confirmMessage={`Delete "${project.name}" and all of its tasks? This cannot be undone.`}
            />
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Tasks</h2>
        {project.tasks.length === 0 ? (
          <p className="text-sm text-gray-500">
            No tasks yet. Task CRUD screens are the next phase 1 step.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {project.tasks.map((task) => (
              <li key={task.id} className="rounded border border-gray-200 bg-white p-3 text-sm">
                {task.title}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
