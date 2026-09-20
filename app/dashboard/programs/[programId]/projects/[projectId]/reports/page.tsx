import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { programs, projects } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { getProjectTasksFlat } from "@/lib/queries";
import { buildReportData, type ReportTask } from "@/lib/reports";
import { PriorityBadge, StatusBadge } from "@/components/status-badge";
import { ViewTabs } from "@/components/views/view-tabs";
import { ItemHeader, type ItemHeaderMeta } from "@/components/views/item-header";
import { projectBreadcrumbs } from "@/lib/breadcrumbs";
import { ReportView } from "@/components/reports/report-view";

export default async function ProjectReportsPage({
  params,
}: {
  params: Promise<{ programId: string; projectId: string }>;
}) {
  const { programId, projectId } = await params;
  const ctx = await requireOrgContext();

  const program = await db.query.programs.findFirst({
    where: and(eq(programs.id, programId), eq(programs.orgId, ctx.org.id)),
    with: { portfolio: true },
  });
  if (!program) notFound();

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.programId, programId)),
  });
  if (!project) notFound();

  const projectTasks = await getProjectTasksFlat(projectId);
  const reportTasks: ReportTask[] = projectTasks.map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate,
    assigneeId: task.assigneeId,
    assigneeName: task.assignee?.name ?? null,
    programId,
    programName: program.name,
    projectId: project.id,
    projectName: project.name,
  }));

  const data = buildReportData(reportTasks);

  const meta: ItemHeaderMeta[] = [];
  if (project.startDate) meta.push({ label: "Start", value: new Date(project.startDate).toLocaleDateString() });
  if (project.dueDate) meta.push({ label: "Due", value: new Date(project.dueDate).toLocaleDateString() });

  return (
    <div className="flex flex-col gap-8">
      <ItemHeader
        breadcrumbs={projectBreadcrumbs(program)}
        name={project.name}
        badges={
          <>
            <StatusBadge status={project.status} />
            <PriorityBadge priority={project.priority} />
          </>
        }
        description={project.description}
        meta={meta}
      />

      <ViewTabs
        basePath={`/dashboard/programs/${programId}/projects/${project.id}`}
        active="reports"
        hrefs={{ list: `/dashboard/programs/${programId}/projects/${project.id}/tasks` }}
      />

      <ReportView data={data} projectProgress={[]} />
    </div>
  );
}
