import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { portfolios } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { ViewTabs } from "@/components/views/view-tabs";
import { ViewHeader } from "@/components/views/view-header";
import { GanttView } from "@/components/views/gantt-view";

export default async function PortfolioGanttPage({ params }: { params: Promise<{ portfolioId: string }> }) {
  const { portfolioId } = await params;
  const ctx = await requireOrgContext();

  const portfolio = await db.query.portfolios.findFirst({
    where: and(eq(portfolios.id, portfolioId), eq(portfolios.orgId, ctx.org.id)),
    with: {
      programs: { orderBy: (program, { asc }) => [asc(program.createdAt)] },
    },
  });
  if (!portfolio) notFound();

  const basePath = `/dashboard/portfolios/${portfolioId}`;

  return (
    <div className="flex flex-col gap-6">
      <ViewHeader
        backHref={basePath}
        backLabel={portfolio.name}
        title="Programs"
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
        />
      )}
    </div>
  );
}
