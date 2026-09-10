import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { programs } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { ViewTabs } from "@/components/views/view-tabs";
import { ItemHeader, type ItemHeaderMeta } from "@/components/views/item-header";
import { StatusBadge } from "@/components/status-badge";
import { GanttView } from "@/components/views/gantt-view";
import { updateProjectDates } from "../projects/actions";

export default async function ProgramGanttPage({ params }: { params: Promise<{ programId: string }> }) {
  const { programId } = await params;
  const ctx = await requireOrgContext();

  const program = await db.query.programs.findFirst({
    where: and(eq(programs.id, programId), eq(programs.orgId, ctx.org.id)),
    with: {
      owner: true,
      projects: { orderBy: (project, { asc }) => [asc(project.createdAt)] },
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
        backHref={basePath}
        backLabel={program.name}
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
        active="gantt"
        views={["list", "board", "calendar", "gantt"]}
        hrefs={{ list: basePath }}
      />

      {program.projects.length === 0 ? (
        <p className="text-sm text-gray-500">No projects yet.</p>
      ) : (
        <GanttView
          items={program.projects.map((p) => ({
            id: p.id,
            title: p.name,
            status: p.status,
            href: `${basePath}/projects/${p.id}`,
            startDate: p.startDate,
            endDate: p.dueDate,
          }))}
          onDateChange={updateProjectDates.bind(null, programId)}
          readOnly={ctx.role !== "admin"}
        />
      )}
    </div>
  );
}
