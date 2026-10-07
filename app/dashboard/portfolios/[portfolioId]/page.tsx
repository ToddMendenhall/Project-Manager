import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { portfolios } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { getLinkedWhiteboards } from "@/lib/queries";
import { getActivity } from "@/lib/activity";
import { ActivityFeed } from "@/components/activity/activity-feed";
import { LinkedWhiteboards } from "@/components/whiteboards/linked-whiteboards";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { ViewTabs } from "@/components/views/view-tabs";
import { ItemHeader } from "@/components/views/item-header";
import { itemHeaderMeta } from "@/lib/item-header";
import { portfolioBreadcrumbs } from "@/lib/breadcrumbs";
import { deletePortfolio } from "../actions";

export default async function PortfolioDetailPage({
  params,
}: {
  params: Promise<{ portfolioId: string }>;
}) {
  const { portfolioId } = await params;
  const ctx = await requireOrgContext();

  const portfolio = await db.query.portfolios.findFirst({
    where: and(eq(portfolios.id, portfolioId), eq(portfolios.orgId, ctx.org.id)),
    with: {
      programs: {
        orderBy: (program, { desc }) => [desc(program.createdAt)],
        // Project ids only: the list just shows a count per program.
        with: { projects: { columns: { id: true } }, owner: { columns: { id: true, name: true } } },
      },
    },
  });

  if (!portfolio) notFound();

  const [meta, linkedBoards, activity] = await Promise.all([
    itemHeaderMeta("portfolio", portfolio.id),
    getLinkedWhiteboards(ctx.org.id, { portfolioId: portfolio.id }),
    getActivity(ctx.org.id, { portfolioId: portfolio.id }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <ItemHeader
        breadcrumbs={portfolioBreadcrumbs()}
        name={portfolio.name}
        badges={<StatusBadge status={portfolio.status} />}
        description={portfolio.description}
        meta={meta}
        action={
          <>
            <Link href={`/dashboard/portfolios/${portfolio.id}/edit`} className="text-sm underline">
              Edit
            </Link>
            <ConfirmDeleteButton
              action={deletePortfolio.bind(null, portfolio.id)}
              confirmMessage={`Delete "${portfolio.name}"? Its programs will become unassigned, not deleted.`}
            />
          </>
        }
      />

      <ViewTabs
        basePath={`/dashboard/portfolios/${portfolio.id}`}
        active="list"
        views={["list", "board", "calendar", "gantt", "reports"]}
        hrefs={{ list: `/dashboard/portfolios/${portfolio.id}` }}
      />

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Programs</h2>
          <Link
            href={`/dashboard/programs/new?portfolioId=${portfolio.id}`}
            className="rounded bg-cy-blue-600 px-3 py-1.5 text-[13px] font-semibold text-white transition-colors duration-fast hover:bg-cy-blue-700"
          >
            New Program
          </Link>
        </div>
        {portfolio.programs.length === 0 ? (
          <p className="text-sm text-cy-gray-500">No programs in this portfolio yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {portfolio.programs.map((program) => (
              <li key={program.id}>
                <Link
                  href={`/dashboard/programs/${program.id}`}
                  className="block rounded border border-cy-gray-100 bg-white p-4 hover:border-cy-gray-400"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{program.name}</p>
                    <StatusBadge status={program.status} />
                  </div>
                  {program.description && (
                    <p className="mt-1 text-sm text-cy-gray-500">{program.description}</p>
                  )}
                  <p className="mt-2 text-xs text-cy-gray-400">
                    {program.projects.length} project{program.projects.length === 1 ? "" : "s"}
                    {program.owner && ` · Owner: ${program.owner.name}`}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <LinkedWhiteboards boards={linkedBoards} />

      <ActivityFeed {...activity} selfId={portfolio.id} />
    </div>
  );
}
