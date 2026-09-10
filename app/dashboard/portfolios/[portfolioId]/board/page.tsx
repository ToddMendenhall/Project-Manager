import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { portfolios } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { ViewTabs } from "@/components/views/view-tabs";
import { ViewHeader } from "@/components/views/view-header";
import { BoardView } from "@/components/views/board-view";
import { updateProgramOrder } from "../../../programs/actions";

export default async function PortfolioBoardPage({ params }: { params: Promise<{ portfolioId: string }> }) {
  const { portfolioId } = await params;
  const ctx = await requireOrgContext();

  const portfolio = await db.query.portfolios.findFirst({
    where: and(eq(portfolios.id, portfolioId), eq(portfolios.orgId, ctx.org.id)),
    with: {
      programs: {
        with: { owner: true },
        orderBy: (program, { asc }) => [asc(program.sortOrder)],
      },
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
        active="board"
        views={["list", "board", "calendar", "gantt"]}
        hrefs={{ list: basePath }}
      />

      {portfolio.programs.length === 0 ? (
        <p className="text-sm text-gray-500">No programs in this portfolio yet.</p>
      ) : (
        <BoardView
          items={portfolio.programs.map((program) => ({
            id: program.id,
            status: program.status,
            sortOrder: program.sortOrder,
            card: (
              <>
                <Link href={`/dashboard/programs/${program.id}`} className="font-medium text-gray-900 hover:underline">
                  {program.name}
                </Link>
                {program.owner && <p className="mt-2 text-xs text-gray-500">{program.owner.name}</p>}
                {program.targetEndDate && (
                  <p className="mt-1 text-xs text-gray-400">
                    Target end {new Date(program.targetEndDate).toLocaleDateString()}
                  </p>
                )}
              </>
            ),
          }))}
          readOnly={ctx.role !== "admin"}
          onReorder={updateProgramOrder}
        />
      )}
    </div>
  );
}
