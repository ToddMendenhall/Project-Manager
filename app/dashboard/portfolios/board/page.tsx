import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { portfolios } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { ViewTabs } from "@/components/views/view-tabs";
import { ViewHeader } from "@/components/views/view-header";
import { BoardView } from "@/components/views/board-view";
import { updatePortfolioOrder } from "../actions";

export default async function PortfoliosBoardPage() {
  const ctx = await requireOrgContext();

  const orgPortfolios = await db.query.portfolios.findMany({
    where: eq(portfolios.orgId, ctx.org.id),
    with: { owner: true },
    orderBy: (portfolio, { asc }) => [asc(portfolio.sortOrder)],
  });

  return (
    <div className="flex flex-col gap-6">
      <ViewHeader
        backHref="/dashboard/portfolios"
        backLabel="All Portfolios"
        title="Portfolios"
        action={
          ctx.role === "admin" ? (
            <Link href="/dashboard/portfolios/new" className="rounded bg-cy-blue-600 px-4 py-2 text-[13px] font-semibold text-white transition-colors duration-fast hover:bg-cy-blue-700">
              New Portfolio
            </Link>
          ) : undefined
        }
      />

      <ViewTabs
        basePath="/dashboard/portfolios"
        active="board"
        views={["list", "board", "calendar", "gantt", "reports"]}
        hrefs={{ list: "/dashboard/portfolios" }}
      />

      {orgPortfolios.length === 0 ? (
        <p className="text-sm text-cy-gray-500">No portfolios yet.</p>
      ) : (
        <BoardView
          items={orgPortfolios.map((portfolio) => ({
            id: portfolio.id,
            status: portfolio.status,
            sortOrder: portfolio.sortOrder,
            card: (
              <>
                <Link href={`/dashboard/portfolios/${portfolio.id}`} className="font-medium text-cy-gray-900 hover:underline">
                  {portfolio.name}
                </Link>
                {portfolio.owner && <p className="mt-2 text-xs text-cy-gray-500">{portfolio.owner.name}</p>}
                {portfolio.targetEndDate && (
                  <p className="mt-1 text-xs text-cy-gray-400">
                    Target end {new Date(portfolio.targetEndDate).toLocaleDateString()}
                  </p>
                )}
              </>
            ),
          }))}
          readOnly={ctx.role !== "admin"}
          onReorder={updatePortfolioOrder}
        />
      )}
    </div>
  );
}
