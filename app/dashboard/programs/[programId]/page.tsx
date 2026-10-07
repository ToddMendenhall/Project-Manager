import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { programs } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { getLinkedWhiteboards } from "@/lib/queries";
import { getActivity } from "@/lib/activity";
import { ActivityFeed } from "@/components/activity/activity-feed";
import { LinkedWhiteboards } from "@/components/whiteboards/linked-whiteboards";
import { PriorityBadge, StatusBadge } from "@/components/status-badge";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { ViewTabs } from "@/components/views/view-tabs";
import { ItemHeader, type ItemHeaderMeta } from "@/components/views/item-header";
import { programBreadcrumbs } from "@/lib/breadcrumbs";
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
      owner: { columns: { id: true, name: true } },
      portfolio: true,
      projects: {
        orderBy: (project, { desc }) => [desc(project.createdAt)],
        // Task ids only: the list just shows a count per project.
        with: { lead: { columns: { id: true, name: true } }, tasks: { columns: { id: true } } },
      },
    },
  });

  if (!program) notFound();

  const meta: ItemHeaderMeta[] = [];
  if (program.owner) meta.push({ label: "Owner", value: program.owner.name });
  if (program.startDate) meta.push({ label: "Start", value: new Date(program.startDate).toLocaleDateString() });
  if (program.targetEndDate)
    meta.push({ label: "Target end", value: new Date(program.targetEndDate).toLocaleDateString() });

  return (
    <div className="flex flex-col gap-8">
      <ItemHeader
        breadcrumbs={programBreadcrumbs(program)}
        name={program.name}
        badges={<StatusBadge status={program.status} />}
        description={program.description}
        meta={meta}
        action={
          <>
            <Link href={`/dashboard/programs/${program.id}/edit`} className="text-sm underline">
              Edit
            </Link>
            <ConfirmDeleteButton
              action={deleteProgram.bind(null, program.id)}
              confirmMessage={`Delete "${program.name}" and all of its projects and tasks? This cannot be undone.`}
            />
          </>
        }
      />

      <ViewTabs
        basePath={`/dashboard/programs/${program.id}`}
        active="list"
        views={["list", "board", "calendar", "gantt", "reports"]}
        hrefs={{ list: `/dashboard/programs/${program.id}` }}
      />

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Projects</h2>
          <Link
            href={`/dashboard/programs/${program.id}/projects/new`}
            className="rounded bg-cy-blue-600 px-3 py-1.5 text-[13px] font-semibold text-white transition-colors duration-fast hover:bg-cy-blue-700"
          >
            New Project
          </Link>
        </div>
        {program.projects.length === 0 ? (
          <p className="text-sm text-cy-gray-500">No projects yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {program.projects.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/dashboard/programs/${program.id}/projects/${project.id}`}
                  className="block rounded border border-cy-gray-100 bg-white p-4 hover:border-cy-gray-400"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{project.name}</p>
                    <div className="flex gap-2">
                      <PriorityBadge priority={project.priority} />
                      <StatusBadge status={project.status} />
                    </div>
                  </div>
                  {project.description && (
                    <p className="mt-1 text-sm text-cy-gray-500">{project.description}</p>
                  )}
                  <p className="mt-2 text-xs text-cy-gray-400">
                    {project.tasks.length} task{project.tasks.length === 1 ? "" : "s"}
                    {project.lead && ` · Lead: ${project.lead.name}`}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <LinkedWhiteboards
        boards={await getLinkedWhiteboards(ctx.org.id, { programId: program.id, includeProjects: true })}
        link={{ kind: "program", id: program.id }}
        linkName={program.name}
      />

      <ActivityFeed {...await getActivity(ctx.org.id, { programId: program.id })} selfId={program.id} />
    </div>
  );
}
