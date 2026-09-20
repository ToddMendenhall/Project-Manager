import { notFound } from "next/navigation";
import { requireOrgContext } from "@/lib/org";
import { getPortfolioForOrg, getPortfolioTasksFlat } from "@/lib/queries";
import { buildReportData, groupProjectProgress, type ReportTask } from "@/lib/reports";
import { StatusBadge } from "@/components/status-badge";
import { ViewTabs } from "@/components/views/view-tabs";
import { ItemHeader, type ItemHeaderMeta } from "@/components/views/item-header";
import { portfolioBreadcrumbs } from "@/lib/breadcrumbs";
import { ReportView } from "@/components/reports/report-view";

export default async function PortfolioReportsPage({
  params,
}: {
  params: Promise<{ portfolioId: string }>;
}) {
  const { portfolioId } = await params;
  const ctx = await requireOrgContext();

  const portfolio = await getPortfolioForOrg(portfolioId, ctx.org.id);
  if (!portfolio) notFound();

  const portfolioTasks = await getPortfolioTasksFlat(portfolioId, ctx.org.id);
  const reportTasks: ReportTask[] = portfolioTasks.map((task) => ({
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

  const meta: ItemHeaderMeta[] = [];
  if (portfolio.startDate) meta.push({ label: "Start", value: new Date(portfolio.startDate).toLocaleDateString() });
  if (portfolio.targetEndDate)
    meta.push({ label: "Target end", value: new Date(portfolio.targetEndDate).toLocaleDateString() });

  return (
    <div className="flex flex-col gap-8">
      <ItemHeader
        breadcrumbs={portfolioBreadcrumbs()}
        name={portfolio.name}
        badges={<StatusBadge status={portfolio.status} />}
        description={portfolio.description}
        meta={meta}
      />

      <ViewTabs
        basePath={`/dashboard/portfolios/${portfolio.id}`}
        active="reports"
        views={["list", "board", "calendar", "gantt", "reports"]}
        hrefs={{ list: `/dashboard/portfolios/${portfolio.id}` }}
      />

      <ReportView data={data} projectProgress={projectProgress} />
    </div>
  );
}
