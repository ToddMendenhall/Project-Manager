import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { portfolios } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { ViewTabs } from "@/components/views/view-tabs";
import { ViewHeader } from "@/components/views/view-header";
import { CalendarView } from "@/components/views/calendar-view";
import { CalendarNav } from "@/components/views/calendar-nav";
import { parseMonthParam } from "@/lib/calendar";

export default async function PortfoliosCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await requireOrgContext();

  const orgPortfolios = await db.query.portfolios.findMany({
    where: eq(portfolios.orgId, ctx.org.id),
    orderBy: (portfolio, { desc }) => [desc(portfolio.createdAt)],
  });

  const { year, monthIndex0 } = parseMonthParam(sp.month);
  const basePath = "/dashboard/portfolios";

  const items = orgPortfolios
    .filter((p) => p.targetEndDate)
    .map((p) => ({ id: p.id, title: p.name, date: p.targetEndDate!, href: `${basePath}/${p.id}` }));
  const undated = orgPortfolios
    .filter((p) => !p.targetEndDate)
    .map((p) => ({ id: p.id, title: p.name, date: new Date(), href: `${basePath}/${p.id}` }));

  return (
    <div className="flex flex-col gap-6">
      <ViewHeader
        backHref={basePath}
        backLabel="All Portfolios"
        title="Portfolios"
        action={
          ctx.role === "admin" ? (
            <Link href={`${basePath}/new`} className="rounded bg-gray-900 px-4 py-2 text-sm text-white">
              New Portfolio
            </Link>
          ) : undefined
        }
      />

      <ViewTabs
        basePath={basePath}
        active="calendar"
        views={["list", "board", "calendar", "gantt"]}
        hrefs={{ list: basePath }}
      />

      <CalendarNav basePath={basePath} year={year} monthIndex0={monthIndex0} />

      <CalendarView year={year} monthIndex0={monthIndex0} items={items} undated={undated} />
    </div>
  );
}
