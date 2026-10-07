import Link from "next/link";
import { cookies } from "next/headers";
import { Plus } from "lucide-react";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { portfolios, programs } from "@/db/schema";
import { countOpenTasksForAssignee, getProjectTaskCounts } from "@/lib/queries";
import { SIDEBAR_WIDTH_COOKIE, parseSidebarWidth } from "@/lib/sidebar";
import { NavLinks } from "./nav-links";
import { ResizableSidebar } from "./resizable-sidebar";
import { PortfolioTree, type ProgramNode, type ProjectNode } from "./portfolio-tree";

const PERSONAL_LINKS = [
  { href: "/dashboard", label: "Home", adminOnly: false },
  { href: "/dashboard/my-tasks", label: "My Tasks", adminOnly: false },
  { href: "/dashboard/my-comments", label: "Assigned Comments", adminOnly: false },
  { href: "/dashboard/members", label: "Members", adminOnly: true },
  { href: "/dashboard/attachments", label: "Attachments", adminOnly: true },
] as const;

type RawProgram = { id: string; name: string; projects: { id: string; name: string }[] };

function mapProgram(program: RawProgram, taskCounts: Map<string, number>): ProgramNode {
  return {
    id: program.id,
    name: program.name,
    projects: program.projects.map(
      (project): ProjectNode => ({ id: project.id, name: project.name, taskCount: taskCounts.get(project.id) ?? 0 }),
    ),
  };
}

const nameColumns = { columns: { id: true, name: true } } as const;

/**
 * Renders on every dashboard page (it's in the layout), so it only ever
 * loads names plus two aggregate counts — never task rows, which grow with
 * the org and would be pulled from the database on every page load.
 */
export async function Sidebar({
  orgId,
  userId,
  isAdmin,
}: {
  orgId: string;
  userId: string;
  isAdmin: boolean;
}) {
  const width = parseSidebarWidth((await cookies()).get(SIDEBAR_WIDTH_COOKIE)?.value);
  const [orgPortfolios, ungroupedProgramsRaw, taskCounts, myOpenTaskCount] = await Promise.all([
    db.query.portfolios.findMany({
      where: eq(portfolios.orgId, orgId),
      ...nameColumns,
      with: { programs: { ...nameColumns, with: { projects: nameColumns } } },
      orderBy: (portfolio, { asc }) => [asc(portfolio.name)],
    }),
    db.query.programs.findMany({
      where: and(eq(programs.orgId, orgId), isNull(programs.portfolioId)),
      ...nameColumns,
      with: { projects: nameColumns },
      orderBy: (program, { asc }) => [asc(program.name)],
    }),
    getProjectTaskCounts(orgId),
    countOpenTasksForAssignee(orgId, userId),
  ]);

  const portfolioNodes = orgPortfolios.map((portfolio) => ({
    id: portfolio.id,
    name: portfolio.name,
    programs: portfolio.programs.map((program) => mapProgram(program, taskCounts)),
  }));
  const ungroupedPrograms = ungroupedProgramsRaw.map((program) => mapProgram(program, taskCounts));

  return (
    <ResizableSidebar initialWidth={width}>
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
          <Link
            href="/dashboard/portfolios/new"
            className="text-cy-gray-400 hover:text-cy-blue-600"
            title="New Portfolio"
            aria-label="New Portfolio"
          >
            <Plus size={16} strokeWidth={2} />
          </Link>
        </div>
        {portfolioNodes.length === 0 && ungroupedPrograms.length === 0 ? (
          <p className="px-2 text-xs text-cy-gray-400">Nothing here yet.</p>
        ) : (
          <PortfolioTree portfolios={portfolioNodes} ungroupedPrograms={ungroupedPrograms} />
        )}
      </div>
    </ResizableSidebar>
  );
}
