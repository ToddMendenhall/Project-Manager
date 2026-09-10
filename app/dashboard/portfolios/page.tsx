import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { portfolios } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { StatusBadge } from "@/components/status-badge";
import { ViewTabs } from "@/components/views/view-tabs";

export default async function PortfoliosPage() {
  const ctx = await requireOrgContext();

  const orgPortfolios = await db.query.portfolios.findMany({
    where: eq(portfolios.orgId, ctx.org.id),
    with: { programs: true, owner: true },
    orderBy: (portfolio, { desc }) => [desc(portfolio.createdAt)],
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Portfolios</h1>
        {ctx.role === "admin" && (
          <Link
            href="/dashboard/portfolios/new"
            className="rounded bg-gray-900 px-4 py-2 text-sm text-white"
          >
            New Portfolio
          </Link>
        )}
      </div>

      <ViewTabs
        basePath="/dashboard/portfolios"
        active="list"
        views={["list", "board", "calendar", "gantt"]}
        hrefs={{ list: "/dashboard/portfolios" }}
      />

      {orgPortfolios.length === 0 ? (
        <p className="text-sm text-gray-500">No portfolios yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {orgPortfolios.map((portfolio) => (
            <li key={portfolio.id}>
              <Link
                href={`/dashboard/portfolios/${portfolio.id}`}
                className="block rounded border border-gray-200 bg-white p-4 hover:border-gray-400"
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium">{portfolio.name}</p>
                  <StatusBadge status={portfolio.status} />
                </div>
                {portfolio.description && (
                  <p className="mt-1 text-sm text-gray-500">{portfolio.description}</p>
                )}
                <p className="mt-2 text-xs text-gray-400">
                  {portfolio.programs.length} program{portfolio.programs.length === 1 ? "" : "s"}
                  {portfolio.owner && ` · Owner: ${portfolio.owner.name}`}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
