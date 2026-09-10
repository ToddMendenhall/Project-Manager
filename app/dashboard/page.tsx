import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { portfolios, programs } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { StatusBadge } from "@/components/status-badge";
import { StatCard } from "@/components/stat-card";

export default async function DashboardPage() {
  const ctx = await requireOrgContext();

  const [orgPortfolioCount, orgPrograms] = await Promise.all([
    db.$count(portfolios, eq(portfolios.orgId, ctx.org.id)),
    db.query.programs.findMany({
      where: eq(programs.orgId, ctx.org.id),
      with: {
        projects: {
          with: {
            tasks: true,
          },
        },
      },
      orderBy: (program, { desc }) => [desc(program.createdAt)],
    }),
  ]);

  const totalProjects = orgPrograms.reduce((sum, p) => sum + p.projects.length, 0);
  const totalTasks = orgPrograms.reduce(
    (sum, p) => sum + p.projects.reduce((s, proj) => s + proj.tasks.length, 0),
    0,
  );
  const recentPrograms = orgPrograms.slice(0, 5);

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Portfolios" value={orgPortfolioCount} />
        <StatCard label="Programs" value={orgPrograms.length} />
        <StatCard label="Projects" value={totalProjects} />
        <StatCard label="Tasks" value={totalTasks} />
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent Programs</h2>
          <Link href="/dashboard/programs" className="text-sm underline">
            View all programs &rarr;
          </Link>
        </div>
        {recentPrograms.length === 0 ? (
          <p className="text-sm text-gray-500">
            No programs yet. Run <code>npm run db:seed</code> for sample data, or{" "}
            <Link href="/dashboard/programs/new" className="underline">
              create your first program
            </Link>
            .
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {recentPrograms.map((program) => (
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
