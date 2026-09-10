import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { portfolios } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { ViewTabs } from "@/components/views/view-tabs";
import { ViewHeader } from "@/components/views/view-header";
import { GanttView } from "@/components/views/gantt-view";
import { updatePortfolioDates } from "../actions";

export default async function PortfoliosGanttPage() {
  const ctx = await requireOrgContext();

  const orgPortfolios = await db.query.portfolios.findMany({
    where: eq(portfolios.orgId, ctx.org.id),
    orderBy: (portfolio, { asc }) => [asc(portfolio.createdAt)],
  });

  return (
    <div className="flex flex-col gap-6">
      <ViewHeader
        backHref="/dashboard/portfolios"
        backLabel="All Portfolios"
        title="Portfolios"
        action={
          ctx.role === "admin" ? (
            <Link href="/dashboard/portfolios/new" className="rounded bg-gray-900 px-4 py-2 text-sm text-white">
              New Portfolio
            </Link>
          ) : undefined
        }
      />

      <ViewTabs
        basePath="/dashboard/portfolios"
        active="gantt"
        views={["list", "board", "calendar", "gantt"]}
        hrefs={{ list: "/dashboard/portfolios" }}
      />

      {orgPortfolios.length === 0 ? (
        <p className="text-sm text-gray-500">No portfolios yet.</p>
      ) : (
        <GanttView
          items={orgPortfolios.map((p) => ({
            id: p.id,
            title: p.name,
            status: p.status,
            href: `/dashboard/portfolios/${p.id}`,
            startDate: p.startDate,
            endDate: p.targetEndDate,
          }))}
          onDateChange={updatePortfolioDates}
          readOnly={ctx.role !== "admin"}
        />
      )}
    </div>
  );
}
