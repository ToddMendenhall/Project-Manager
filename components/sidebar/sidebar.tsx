import Link from "next/link";
import { Plus } from "lucide-react";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { portfolios, programs } from "@/db/schema";
import { getOrgTasksFlat } from "@/lib/queries";
import { NavLinks } from "./nav-links";
import { PortfolioTree, type ProgramNode, type ProjectNode } from "./portfolio-tree";

const PERSONAL_LINKS = [
  { href: "/dashboard", label: "Home", adminOnly: false },
  { href: "/dashboard/my-tasks", label: "My Tasks", adminOnly: false },
  { href: "/dashboard/my-comments", label: "Assigned Comments", adminOnly: false },
  { href: "/dashboard/members", label: "Members", adminOnly: true },
  { href: "/dashboard/attachments", label: "Attachments", adminOnly: true },
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
    <aside className="flex h-full w-64 shrink-0 flex-col overflow-y-auto border-r border-cy-gray-100 bg-cy-gray-025">
      <NavLinks
        links={PERSONAL_LINKS.filter((link) => !link.adminOnly || isAdmin).map((l) => ({ href: l.href, label: l.label }))}
        myOpenTaskCount={myOpenTaskCount}
      />

      <div className="flex-1 border-t border-cy-gray-100 p-3">
        <div className="mb-2 flex items-center justify-between px-2">
          <Link
            href="/dashboard/portfolios"
            className="text-[11px] font-semibold uppercase tracking-eyebrow text-cy-gray-400 hover:text-cy-gray-600"
          >
            Portfolios
          </Link>
          {isAdmin && (
            <Link
              href="/dashboard/portfolios/new"
              className="text-cy-gray-400 hover:text-cy-blue-600"
              title="New Portfolio"
              aria-label="New Portfolio"
            >
              <Plus size={16} strokeWidth={2} />
            </Link>
          )}
        </div>
        {portfolioNodes.length === 0 && ungroupedPrograms.length === 0 ? (
          <p className="px-2 text-xs text-cy-gray-400">Nothing here yet.</p>
        ) : (
          <PortfolioTree portfolios={portfolioNodes} ungroupedPrograms={ungroupedPrograms} isAdmin={isAdmin} />
        )}
      </div>
    </aside>
  );
}
