import { eq } from "drizzle-orm";
import { db } from "@/db";
import { programs } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";

export default async function DashboardPage() {
  const ctx = await requireOrgContext();

  const orgPrograms = await db.query.programs.findMany({
    where: eq(programs.orgId, ctx.org.id),
    with: {
      projects: {
        with: {
          tasks: true,
        },
      },
    },
    orderBy: (program, { desc }) => [desc(program.createdAt)],
  });

  const totalProjects = orgPrograms.reduce((sum, p) => sum + p.projects.length, 0);
  const totalTasks = orgPrograms.reduce(
    (sum, p) => sum + p.projects.reduce((s, proj) => s + proj.tasks.length, 0),
    0,
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Programs" value={orgPrograms.length} />
        <StatCard label="Projects" value={totalProjects} />
        <StatCard label="Tasks" value={totalTasks} />
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Programs</h2>
        {orgPrograms.length === 0 ? (
          <p className="text-sm text-gray-500">
            No programs yet. Run <code>npm run db:seed</code> for sample data, or add Program/Project/Task
            CRUD screens in the next phase.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {orgPrograms.map((program) => (
              <li key={program.id} className="rounded border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{program.name}</p>
                  <span className="text-xs uppercase text-gray-500">{program.status}</span>
                </div>
                {program.description && (
                  <p className="mt-1 text-sm text-gray-500">{program.description}</p>
                )}
                <p className="mt-2 text-xs text-gray-400">
                  {program.projects.length} project{program.projects.length === 1 ? "" : "s"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-gray-200 bg-white p-4">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}
