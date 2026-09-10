import Link from "next/link";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { portfolios, programs } from "@/db/schema";
import { getOrgTasksFlat } from "@/lib/queries";
import { PortfolioTree, type ProgramNode, type ProjectNode } from "./portfolio-tree";

const PERSONAL_LINKS = [
  { href: "/dashboard", label: "Home" },
  { href: "/dashboard/my-tasks", label: "My Tasks" },
  { href: "/dashboard/my-comments", label: "Assigned Comments" },
  { href: "/dashboard/reports", label: "Reports" },
] as const;

type RawProject = { id: string; name: string; tasks: { id: string }[] };
type RawProgram = { id: string; name: string; projects: RawProject[] };

function mapProgram(program: RawProgram): ProgramNode {
  return {
    id: program.id,
    name: program.name,
    projects: program.projects.map(
      (project): ProjectNode => ({ id: project.id, name: project.name, taskCount: project.tasks.length }),
    ),
  };
}

export async function Sidebar({
  orgId,
  userId,
  isAdmin,
}: {
  orgId: string;
  userId: string;
  isAdmin: boolean;
}) {
  const [orgPortfolios, ungroupedProgramsRaw, orgTasks] = await Promise.all([
    db.query.portfolios.findMany({
      where: eq(portfolios.orgId, orgId),
      with: {
        programs: {
          with: { projects: { with: { tasks: { columns: { id: true } } } } },
        },
      },
      orderBy: (portfolio, { asc }) => [asc(portfolio.name)],
    }),
    db.query.programs.findMany({
      where: and(eq(programs.orgId, orgId), isNull(programs.portfolioId)),
      with: { projects: { with: { tasks: { columns: { id: true } } } } },
      orderBy: (program, { asc }) => [asc(program.name)],
    }),
    getOrgTasksFlat(orgId),
  ]);

  const myOpenTaskCount = orgTasks.filter(
    (task) => task.assigneeId === userId && task.status !== "completed" && task.status !== "cancelled",
  ).length;

  const portfolioNodes = orgPortfolios.map((portfolio) => ({
    id: portfolio.id,
    name: portfolio.name,
    programs: portfolio.programs.map(mapProgram),
  }));
  const ungroupedPrograms = ungroupedProgramsRaw.map(mapProgram);

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-gray-200 bg-gray-50">
      <div className="flex flex-col gap-0.5 p-3">
        {PERSONAL_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="flex items-center justify-between rounded px-2 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            <span>{link.label}</span>
            {link.href === "/dashboard/my-tasks" && myOpenTaskCount > 0 && (
              <span className="rounded-full bg-gray-200 px-1.5 text-xs font-normal text-gray-600">
                {myOpenTaskCount}
              </span>
            )}
          </Link>
        ))}
      </div>

      <div className="flex-1 border-t border-gray-200 p-3">
        <div className="mb-2 flex items-center justify-between px-2">
          <Link
            href="/dashboard/portfolios"
            className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 hover:text-gray-600"
          >
            Portfolios
          </Link>
          {isAdmin && (
            <Link
              href="/dashboard/portfolios/new"
              className="text-sm leading-none text-gray-400 hover:text-gray-700"
              title="New Portfolio"
              aria-label="New Portfolio"
            >
              +
            </Link>
          )}
        </div>
        {portfolioNodes.length === 0 && ungroupedPrograms.length === 0 ? (
          <p className="px-2 text-xs text-gray-400">Nothing here yet.</p>
        ) : (
          <PortfolioTree portfolios={portfolioNodes} ungroupedPrograms={ungroupedPrograms} />
        )}
      </div>
    </aside>
  );
}
