import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { programs } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { ViewTabs } from "@/components/views/view-tabs";
import { ItemHeader, type ItemHeaderMeta } from "@/components/views/item-header";
import { programBreadcrumbs } from "@/lib/breadcrumbs";
import { BoardView } from "@/components/views/board-view";
import { PriorityBadge, StatusBadge } from "@/components/status-badge";
import { updateProjectOrder } from "../projects/actions";

export default async function ProgramBoardPage({ params }: { params: Promise<{ programId: string }> }) {
  const { programId } = await params;
  const ctx = await requireOrgContext();

  const program = await db.query.programs.findFirst({
    where: and(eq(programs.id, programId), eq(programs.orgId, ctx.org.id)),
    with: {
      owner: true,
      portfolio: true,
      projects: {
        with: { lead: true },
        orderBy: (project, { asc }) => [asc(project.sortOrder)],
      },
    },
  });
  if (!program) notFound();

  const basePath = `/dashboard/programs/${programId}`;
  const meta: ItemHeaderMeta[] = [];
  if (program.owner) meta.push({ label: "Owner", value: program.owner.name });
  if (program.startDate) meta.push({ label: "Start", value: new Date(program.startDate).toLocaleDateString() });
  if (program.targetEndDate)
    meta.push({ label: "Target end", value: new Date(program.targetEndDate).toLocaleDateString() });

  return (
    <div className="flex flex-col gap-6">
      <ItemHeader
        breadcrumbs={programBreadcrumbs(program)}
        name={program.name}
        badges={<StatusBadge status={program.status} />}
        description={program.description}
        meta={meta}
        action={
          ctx.role === "admin" ? (
            <Link href={`${basePath}/projects/new`} className="rounded bg-gray-900 px-4 py-2 text-sm text-white">
              New Project
            </Link>
          ) : undefined
        }
      />

      <ViewTabs
        basePath={basePath}
        active="board"
        views={["list", "board", "calendar", "gantt"]}
        hrefs={{ list: basePath }}
      />

      {program.projects.length === 0 ? (
        <p className="text-sm text-gray-500">No projects yet.</p>
      ) : (
        <BoardView
          items={program.projects.map((project) => ({
            id: project.id,
            status: project.status,
            sortOrder: project.sortOrder,
            card: (
              <>
                <Link href={`${basePath}/projects/${project.id}`} className="font-medium text-gray-900 hover:underline">
                  {project.name}
                </Link>
                <div className="mt-2 flex items-center justify-between">
                  <PriorityBadge priority={project.priority} />
                  {project.lead && <span className="text-xs text-gray-500">{project.lead.name}</span>}
                </div>
                {project.dueDate && (
                  <p className="mt-1 text-xs text-gray-400">Due {new Date(project.dueDate).toLocaleDateString()}</p>
                )}
              </>
            ),
          }))}
          readOnly={ctx.role !== "admin"}
          onReorder={updateProjectOrder.bind(null, programId)}
        />
      )}
    </div>
  );
}
