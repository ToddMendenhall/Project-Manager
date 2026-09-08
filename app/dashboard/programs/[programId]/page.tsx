import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { programs } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { PriorityBadge, StatusBadge } from "@/components/status-badge";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { deleteProgram } from "../actions";

export default async function ProgramDetailPage({
  params,
}: {
  params: Promise<{ programId: string }>;
}) {
  const { programId } = await params;
  const ctx = await requireOrgContext();

  const program = await db.query.programs.findFirst({
    where: and(eq(programs.id, programId), eq(programs.orgId, ctx.org.id)),
    with: {
      owner: true,
      projects: {
        orderBy: (project, { desc }) => [desc(project.createdAt)],
        with: { lead: true, tasks: true },
      },
    },
  });

  if (!program) notFound();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/dashboard/programs" className="text-sm text-gray-500 underline">
          &larr; All Programs
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">{program.name}</h1>
            <StatusBadge status={program.status} />
          </div>
          {program.description && (
            <p className="mt-2 max-w-2xl text-sm text-gray-600">{program.description}</p>
          )}
          <dl className="mt-3 flex gap-6 text-xs text-gray-500">
            {program.owner && (
              <div>
                <dt className="font-medium text-gray-400">Owner</dt>
                <dd>{program.owner.name}</dd>
              </div>
            )}
            {program.startDate && (
              <div>
                <dt className="font-medium text-gray-400">Start</dt>
                <dd>{new Date(program.startDate).toLocaleDateString()}</dd>
              </div>
            )}
            {program.targetEndDate && (
              <div>
                <dt className="font-medium text-gray-400">Target end</dt>
                <dd>{new Date(program.targetEndDate).toLocaleDateString()}</dd>
              </div>
            )}
          </dl>
        </div>
        {ctx.role === "admin" && (
          <div className="flex items-center gap-4">
            <Link href={`/dashboard/programs/${program.id}/edit`} className="text-sm underline">
              Edit
            </Link>
            <ConfirmDeleteButton
              action={deleteProgram.bind(null, program.id)}
              confirmMessage={`Delete "${program.name}" and all of its projects and tasks? This cannot be undone.`}
            />
          </div>
        )}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Projects</h2>
          {ctx.role === "admin" && (
            <Link
              href={`/dashboard/programs/${program.id}/projects/new`}
              className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white"
            >
              New Project
            </Link>
          )}
        </div>
        {program.projects.length === 0 ? (
          <p className="text-sm text-gray-500">No projects yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {program.projects.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/dashboard/programs/${program.id}/projects/${project.id}`}
                  className="block rounded border border-gray-200 bg-white p-4 hover:border-gray-400"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{project.name}</p>
                    <div className="flex gap-2">
                      <PriorityBadge priority={project.priority} />
                      <StatusBadge status={project.status} />
                    </div>
                  </div>
                  {project.description && (
                    <p className="mt-1 text-sm text-gray-500">{project.description}</p>
                  )}
                  <p className="mt-2 text-xs text-gray-400">
                    {project.tasks.length} task{project.tasks.length === 1 ? "" : "s"}
                    {project.lead && ` · Lead: ${project.lead.name}`}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
