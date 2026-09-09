import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { portfolios } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
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
      owner: true,
      programs: {
        orderBy: (program, { desc }) => [desc(program.createdAt)],
        with: { projects: true, owner: true },
      },
    },
  });

  if (!portfolio) notFound();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/dashboard/portfolios" className="text-sm text-gray-500 underline">
          &larr; All Portfolios
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">{portfolio.name}</h1>
            <StatusBadge status={portfolio.status} />
          </div>
          {portfolio.description && (
            <p className="mt-2 max-w-2xl text-sm text-gray-600">{portfolio.description}</p>
          )}
          <dl className="mt-3 flex gap-6 text-xs text-gray-500">
            {portfolio.owner && (
              <div>
                <dt className="font-medium text-gray-400">Owner</dt>
                <dd>{portfolio.owner.name}</dd>
              </div>
            )}
            {portfolio.startDate && (
              <div>
                <dt className="font-medium text-gray-400">Start</dt>
                <dd>{new Date(portfolio.startDate).toLocaleDateString()}</dd>
              </div>
            )}
            {portfolio.targetEndDate && (
              <div>
                <dt className="font-medium text-gray-400">Target end</dt>
                <dd>{new Date(portfolio.targetEndDate).toLocaleDateString()}</dd>
              </div>
            )}
          </dl>
        </div>
        {ctx.role === "admin" && (
          <div className="flex items-center gap-4">
            <Link href={`/dashboard/portfolios/${portfolio.id}/edit`} className="text-sm underline">
              Edit
            </Link>
            <ConfirmDeleteButton
              action={deletePortfolio.bind(null, portfolio.id)}
              confirmMessage={`Delete "${portfolio.name}"? Its programs will become unassigned, not deleted.`}
            />
          </div>
        )}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Programs</h2>
          {ctx.role === "admin" && (
            <Link
              href={`/dashboard/programs/new?portfolioId=${portfolio.id}`}
              className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white"
            >
              New Program
            </Link>
          )}
        </div>
        {portfolio.programs.length === 0 ? (
          <p className="text-sm text-gray-500">No programs in this portfolio yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {portfolio.programs.map((program) => (
              <li key={program.id}>
                <Link
                  href={`/dashboard/programs/${program.id}`}
                  className="block rounded border border-gray-200 bg-white p-4 hover:border-gray-400"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{program.name}</p>
                    <StatusBadge status={program.status} />
                  </div>
                  {program.description && (
                    <p className="mt-1 text-sm text-gray-500">{program.description}</p>
                  )}
                  <p className="mt-2 text-xs text-gray-400">
                    {program.projects.length} project{program.projects.length === 1 ? "" : "s"}
                    {program.owner && ` · Owner: ${program.owner.name}`}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
