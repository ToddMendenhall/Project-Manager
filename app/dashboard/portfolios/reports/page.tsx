import { requireOrgContext } from "@/lib/org";
import { getOrgTasksFlat } from "@/lib/queries";
import { buildReportData, groupProjectProgress, type ReportTask } from "@/lib/reports";
import { ViewHeader } from "@/components/views/view-header";
import { ViewTabs } from "@/components/views/view-tabs";
import { ReportView } from "@/components/reports/report-view";

export default async function PortfoliosReportsPage() {
  const ctx = await requireOrgContext();
  const orgTasks = await getOrgTasksFlat(ctx.org.id);

  const reportTasks: ReportTask[] = orgTasks.map((task) => ({
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
  const projectProgress = groupProjectProgress(reportTasks);

  return (
    <div className="flex flex-col gap-6">
      <ViewHeader backHref="/dashboard/portfolios" backLabel="All Portfolios" title="Portfolios" />

      <ViewTabs
        basePath="/dashboard/portfolios"
        active="reports"
        views={["list", "board", "calendar", "gantt", "reports"]}
        hrefs={{ list: "/dashboard/portfolios" }}
      />

      <ReportView data={data} projectProgress={projectProgress} />
    </div>
  );
}
