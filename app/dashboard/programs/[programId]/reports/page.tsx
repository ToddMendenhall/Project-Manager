import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { programs } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { getProgramTasksFlat } from "@/lib/queries";
import { buildReportData, groupProjectProgress, type ReportTask } from "@/lib/reports";
import { StatusBadge } from "@/components/status-badge";
import { ViewTabs } from "@/components/views/view-tabs";
import { ItemHeader, type ItemHeaderMeta } from "@/components/views/item-header";
import { programBreadcrumbs } from "@/lib/breadcrumbs";
import { ReportView } from "@/components/reports/report-view";

export default async function ProgramReportsPage({
  params,
}: {
  params: Promise<{ programId: string }>;
}) {
  const { programId } = await params;
  const ctx = await requireOrgContext();

  const program = await db.query.programs.findFirst({
    where: and(eq(programs.id, programId), eq(programs.orgId, ctx.org.id)),
    with: { portfolio: true },
  });
  if (!program) notFound();

  const programTasks = await getProgramTasksFlat(programId);
  const reportTasks: ReportTask[] = programTasks.map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate,
    assigneeId: task.assigneeId,
    assigneeName: task.assignee?.name ?? null,
    programId: task.programId,
    programName: task.programName,
    projectId: task.projectId,
    projectName: task.projectName,
  }));

  const data = buildReportData(reportTasks);
  const projectProgress = groupProjectProgress(reportTasks, program.name);

  const meta: ItemHeaderMeta[] = [];
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
      />

      <ViewTabs
        basePath={`/dashboard/programs/${program.id}`}
        active="reports"
        views={["list", "board", "calendar", "gantt", "reports"]}
        hrefs={{ list: `/dashboard/programs/${program.id}` }}
      />

      <ReportView data={data} projectProgress={projectProgress} />
    </div>
  );
}
