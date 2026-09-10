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
            <Link href="/dashboard/portfolios/new" className="rounded bg-gray-900 px-4 py-2 text-sm text-white">
              New Portfolio
            </Link>
          ) : undefined
        }
      />

      <ViewTabs
        basePath="/dashboard/portfolios"
        active="board"
        views={["list", "board", "calendar", "gantt"]}
        hrefs={{ list: "/dashboard/portfolios" }}
      />

      {orgPortfolios.length === 0 ? (
        <p className="text-sm text-gray-500">No portfolios yet.</p>
      ) : (
        <BoardView
          items={orgPortfolios.map((portfolio) => ({
            id: portfolio.id,
            status: portfolio.status,
            sortOrder: portfolio.sortOrder,
            card: (
              <>
                <Link href={`/dashboard/portfolios/${portfolio.id}`} className="font-medium text-gray-900 hover:underline">
                  {portfolio.name}
                </Link>
                {portfolio.owner && <p className="mt-2 text-xs text-gray-500">{portfolio.owner.name}</p>}
                {portfolio.targetEndDate && (
                  <p className="mt-1 text-xs text-gray-400">
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
