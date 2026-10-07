import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { programs } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { ViewTabs } from "@/components/views/view-tabs";
import { ViewHeader } from "@/components/views/view-header";
import { BoardView } from "@/components/views/board-view";
import { formatCalendarDate } from "@/lib/dates";
import { updateProgramOrder } from "../actions";

export default async function ProgramsBoardPage() {
  const ctx = await requireOrgContext();

  const orgPrograms = await db.query.programs.findMany({
    where: eq(programs.orgId, ctx.org.id),
    columns: { id: true, name: true, status: true, sortOrder: true, targetEndDate: true },
    with: { owner: { columns: { id: true, name: true } }, portfolio: { columns: { name: true } } },
    orderBy: (program, { asc }) => [asc(program.sortOrder)],
  });

  return (
    <div className="flex flex-col gap-6">
      <ViewHeader
        backHref="/dashboard/programs"
        backLabel="All Programs"
        title="Programs"
        action={
          <Link href="/dashboard/programs/new" className="rounded bg-cy-blue-600 px-4 py-2 text-[13px] font-semibold text-white transition-colors duration-fast hover:bg-cy-blue-700">
            New Program
          </Link>
        }
      />

      <ViewTabs
        basePath="/dashboard/programs"
        active="board"
        views={["list", "board", "calendar", "gantt", "reports"]}
        hrefs={{ list: "/dashboard/programs" }}
      />

      {orgPrograms.length === 0 ? (
        <p className="text-sm text-cy-gray-500">No programs yet.</p>
      ) : (
        <BoardView
          items={orgPrograms.map((program) => ({
            id: program.id,
            status: program.status,
            sortOrder: program.sortOrder,
            card: (
              <>
                <Link href={`/dashboard/programs/${program.id}`} className="font-medium text-cy-gray-900 hover:underline">
                  {program.name}
                </Link>
                {program.portfolio && <p className="mt-1 text-xs text-cy-gray-400">{program.portfolio.name}</p>}
                {program.owner && <p className="mt-2 text-xs text-cy-gray-500">{program.owner.name}</p>}
                {program.targetEndDate && (
                  <p className="mt-1 text-xs text-cy-gray-400">
                    Target end {formatCalendarDate(program.targetEndDate)}
                  </p>
                )}
              </>
            ),
          }))}
          onReorder={updateProgramOrder}
        />
      )}
    </div>
  );
}
