import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { programs } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { ViewTabs } from "@/components/views/view-tabs";
import { ViewHeader } from "@/components/views/view-header";
import { GanttView } from "@/components/views/gantt-view";
import { updateProjectDates } from "../projects/actions";

export default async function ProgramGanttPage({ params }: { params: Promise<{ programId: string }> }) {
  const { programId } = await params;
  const ctx = await requireOrgContext();

  const program = await db.query.programs.findFirst({
    where: and(eq(programs.id, programId), eq(programs.orgId, ctx.org.id)),
    with: {
      projects: { orderBy: (project, { asc }) => [asc(project.createdAt)] },
    },
  });
  if (!program) notFound();

  const basePath = `/dashboard/programs/${programId}`;

  return (
    <div className="flex flex-col gap-6">
      <ViewHeader
        backHref={basePath}
        backLabel={program.name}
        title="Projects"
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
