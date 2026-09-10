import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { portfolios } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { ViewTabs } from "@/components/views/view-tabs";
import { ItemHeader, type ItemHeaderMeta } from "@/components/views/item-header";
import { StatusBadge } from "@/components/status-badge";
import { GanttView } from "@/components/views/gantt-view";
import { updateProgramDates } from "../../../programs/actions";

export default async function PortfolioGanttPage({ params }: { params: Promise<{ portfolioId: string }> }) {
  const { portfolioId } = await params;
  const ctx = await requireOrgContext();

  const portfolio = await db.query.portfolios.findFirst({
    where: and(eq(portfolios.id, portfolioId), eq(portfolios.orgId, ctx.org.id)),
    with: {
      owner: true,
      programs: { orderBy: (program, { asc }) => [asc(program.createdAt)] },
    },
  });
  if (!portfolio) notFound();

  const basePath = `/dashboard/portfolios/${portfolioId}`;
  const meta: ItemHeaderMeta[] = [];
  if (portfolio.owner) meta.push({ label: "Owner", value: portfolio.owner.name });
  if (portfolio.startDate) meta.push({ label: "Start", value: new Date(portfolio.startDate).toLocaleDateString() });
  if (portfolio.targetEndDate)
    meta.push({ label: "Target end", value: new Date(portfolio.targetEndDate).toLocaleDateString() });

  return (
    <div className="flex flex-col gap-6">
      <ItemHeader
        backHref={basePath}
        backLabel={portfolio.name}
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
        active="gantt"
        views={["list", "board", "calendar", "gantt"]}
        hrefs={{ list: basePath }}
      />

      {portfolio.programs.length === 0 ? (
        <p className="text-sm text-gray-500">No programs in this portfolio yet.</p>
      ) : (
        <GanttView
          items={portfolio.programs.map((p) => ({
            id: p.id,
            title: p.name,
            status: p.status,
            href: `/dashboard/programs/${p.id}`,
            startDate: p.startDate,
            endDate: p.targetEndDate,
          }))}
          onDateChange={updateProgramDates}
          readOnly={ctx.role !== "admin"}
        />
      )}
    </div>
  );
}
