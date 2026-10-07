import Link from "next/link";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { programs } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { StatusBadge } from "@/components/status-badge";
import { StatCard } from "@/components/stat-card";

export default async function DashboardPage() {
  const ctx = await requireOrgContext();

  // Counts are computed in SQL, and only the 5 recent programs are loaded,
  // never task rows: this is the page everyone lands on after signing in.
  const [countRows, recentPrograms] = await Promise.all([
    db.execute<{ portfolios: number; programs: number; projects: number; tasks: number }>(sql`
      select
        (select count(*)::int from portfolios where portfolios.org_id = ${ctx.org.id}) as portfolios,
        (select count(*)::int from programs where programs.org_id = ${ctx.org.id}) as programs,
        (select count(*)::int from projects
          join programs on programs.id = projects.program_id
          where programs.org_id = ${ctx.org.id}) as projects,
        (select count(*)::int from tasks
          join projects on projects.id = tasks.project_id
          join programs on programs.id = projects.program_id
          where programs.org_id = ${ctx.org.id}) as tasks`),
    db.query.programs.findMany({
      where: eq(programs.orgId, ctx.org.id),
      columns: { id: true, name: true, description: true, status: true },
      extras: {
        // Written out as programs.id: in a relational query without `with`,
        // Drizzle renders ${programs.id} as a bare "id", which inside this
        // subquery would mean projects.id.
        projectCount: sql<number>`(select count(*)::int from projects where projects.program_id = programs.id)`.as(
          "project_count",
        ),
      },
      orderBy: (program, { desc }) => [desc(program.createdAt)],
      limit: 5,
    }),
  ]);
  const counts = Array.from(countRows)[0];

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Portfolios" value={counts.portfolios} />
        <StatCard label="Programs" value={counts.programs} />
        <StatCard label="Projects" value={counts.projects} />
        <StatCard label="Tasks" value={counts.tasks} />
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-cy-gray-900">Recent Programs</h2>
          <Link href="/dashboard/programs" className="text-sm text-cy-blue-600 hover:underline">
            View all programs &rarr;
          </Link>
        </div>
        {recentPrograms.length === 0 ? (
          <p className="text-sm text-cy-gray-500">
            No programs yet. Run <code>npm run db:seed</code> for sample data, or{" "}
            <Link href="/dashboard/programs/new" className="text-cy-blue-600 hover:underline">
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
                  className="block rounded-card border border-cy-gray-100 bg-white p-4 shadow-xs transition-colors duration-fast hover:border-cy-gray-200 hover:shadow-md"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-cy-gray-900">{program.name}</p>
                    <StatusBadge status={program.status} />
                  </div>
                  {program.description && (
                    <p className="mt-1 text-sm text-cy-gray-500">{program.description}</p>
                  )}
                  <p className="mt-2 font-mono text-xs text-cy-gray-400">
                    {program.projectCount} project{program.projectCount === 1 ? "" : "s"}
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
