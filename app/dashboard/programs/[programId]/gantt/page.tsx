import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { programs } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { ViewTabs } from "@/components/views/view-tabs";
import { ItemHeader } from "@/components/views/item-header";
import { itemHeaderMeta } from "@/lib/item-header";
import { programBreadcrumbs } from "@/lib/breadcrumbs";
import { StatusBadge } from "@/components/status-badge";
import { GanttView } from "@/components/views/gantt-view";
import { projectNode, GANTT_CHECKLIST_COLUMNS, GANTT_TASK_COLUMNS } from "@/lib/gantt-tree";
import { updateProjectDates } from "../projects/actions";
import { updateTaskDates } from "../projects/[projectId]/tasks/actions";

export default async function ProgramGanttPage({ params }: { params: Promise<{ programId: string }> }) {
  const { programId } = await params;
  const ctx = await requireOrgContext();

  const program = await db.query.programs.findFirst({
    where: and(eq(programs.id, programId), eq(programs.orgId, ctx.org.id)),
    with: {
      portfolio: true,
      projects: {
        orderBy: (project, { asc }) => [asc(project.createdAt)],
        with: {
          tasks: {
            columns: GANTT_TASK_COLUMNS,
            orderBy: (task, { asc }) => [asc(task.createdAt)],
            with: {
              checklistItems: { columns: GANTT_CHECKLIST_COLUMNS, orderBy: (item, { asc }) => [asc(item.createdAt)] },
            },
          },
        },
      },
    },
  });
  if (!program) notFound();

  const basePath = `/dashboard/programs/${programId}`;
  const items = program.projects.map((p) => projectNode(p, basePath));
  const meta = await itemHeaderMeta("program", program.id);

  return (
    <div className="flex flex-col gap-6">
      <ItemHeader
        breadcrumbs={programBreadcrumbs(program)}
        name={program.name}
        badges={<StatusBadge status={program.status} />}
        description={program.description}
        meta={meta}
        action={
          <Link href={`${basePath}/projects/new`} className="rounded bg-cy-blue-600 px-4 py-2 text-[13px] font-semibold text-white transition-colors duration-fast hover:bg-cy-blue-700">
            New Project
          </Link>
        }
      />

      <ViewTabs
        basePath={basePath}
        active="gantt"
        views={["list", "board", "calendar", "gantt", "reports"]}
        hrefs={{ list: basePath }}
      />

      {program.projects.length === 0 ? (
        <p className="text-sm text-cy-gray-500">No projects yet.</p>
      ) : (
        <GanttView
          items={items}
          summary={{ title: program.name, href: basePath }}
          onProjectDateChange={updateProjectDates}
          onTaskDateChange={updateTaskDates}
        />
      )}
    </div>
  );
}
