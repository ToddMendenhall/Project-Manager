import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { portfolios } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { ViewTabs } from "@/components/views/view-tabs";
import { ItemHeader, type ItemHeaderMeta } from "@/components/views/item-header";
import { portfolioBreadcrumbs } from "@/lib/breadcrumbs";
import { StatusBadge } from "@/components/status-badge";
import { CalendarView } from "@/components/views/calendar-view";
import { CalendarNav } from "@/components/views/calendar-nav";
import { parseMonthParam } from "@/lib/calendar";

export default async function PortfolioCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ portfolioId: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { portfolioId } = await params;
  const sp = await searchParams;
  const ctx = await requireOrgContext();

  const portfolio = await db.query.portfolios.findFirst({
    where: and(eq(portfolios.id, portfolioId), eq(portfolios.orgId, ctx.org.id)),
    with: { owner: true, programs: true },
  });
  if (!portfolio) notFound();

  const { year, monthIndex0 } = parseMonthParam(sp.month);
  const basePath = `/dashboard/portfolios/${portfolioId}`;
  const meta: ItemHeaderMeta[] = [];
  if (portfolio.owner) meta.push({ label: "Owner", value: portfolio.owner.name });
  if (portfolio.startDate) meta.push({ label: "Start", value: new Date(portfolio.startDate).toLocaleDateString() });
  if (portfolio.targetEndDate)
    meta.push({ label: "Target end", value: new Date(portfolio.targetEndDate).toLocaleDateString() });

  const items = portfolio.programs
    .filter((p) => p.targetEndDate)
    .map((p) => ({ id: p.id, title: p.name, date: p.targetEndDate!, href: `/dashboard/programs/${p.id}` }));
  const undated = portfolio.programs
    .filter((p) => !p.targetEndDate)
    .map((p) => ({ id: p.id, title: p.name, date: new Date(), href: `/dashboard/programs/${p.id}` }));

  return (
    <div className="flex flex-col gap-6">
      <ItemHeader
        breadcrumbs={portfolioBreadcrumbs()}
        name={portfolio.name}
        badges={<StatusBadge status={portfolio.status} />}
        description={portfolio.description}
        meta={meta}
        action={
          ctx.role === "admin" ? (
            <Link
              href={`/dashboard/programs/new?portfolioId=${portfolio.id}`}
              className="rounded bg-gray-900 px-4 py-2 text-sm text-white"
            >
              New Program
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
