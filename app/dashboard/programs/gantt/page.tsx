import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { programs } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { ViewTabs } from "@/components/views/view-tabs";
import { ViewHeader } from "@/components/views/view-header";
import { GanttView } from "@/components/views/gantt-view";
import { programNode, GANTT_CHECKLIST_COLUMNS, GANTT_TASK_COLUMNS } from "@/lib/gantt-tree";
import { updateProgramDates } from "../actions";
import { updateProjectDates } from "../[programId]/projects/actions";
import { updateTaskDates } from "../[programId]/projects/[projectId]/tasks/actions";

export default async function ProgramsGanttPage() {
  const ctx = await requireOrgContext();

  const orgPrograms = await db.query.programs.findMany({
    where: eq(programs.orgId, ctx.org.id),
    orderBy: (program, { asc }) => [asc(program.createdAt)],
    with: {
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

  return (
    <div className="flex flex-col gap-6">
      <ViewHeader
        backHref="/dashboard/programs"
        backLabel="All Programs"
        title="Programs"
        action={
          <Link href="/dashboard/programs/new" className="rounded bg-cy-blue-600 px-4 py-2 text-[13px] font-semibold text-white transition-colors duration-fast hover:bg-cy-blue-700">
            New Program
          </Link>
        }
      />

      <ViewTabs
        basePath="/dashboard/programs"
        active="gantt"
        views={["list", "board", "calendar", "gantt", "reports"]}
        hrefs={{ list: "/dashboard/programs" }}
      />

      {orgPrograms.length === 0 ? (
        <p className="text-sm text-cy-gray-500">No programs yet.</p>
      ) : (
        <GanttView
          items={orgPrograms.map(programNode)}
          onProgramDateChange={updateProgramDates}
          onProjectDateChange={updateProjectDates}
          onTaskDateChange={updateTaskDates}
        />
      )}
    </div>
  );
}
