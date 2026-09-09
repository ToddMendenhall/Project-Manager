import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { programs } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { StatusBadge } from "@/components/status-badge";

export default async function ProgramsPage() {
  const ctx = await requireOrgContext();

  const orgPrograms = await db.query.programs.findMany({
    where: eq(programs.orgId, ctx.org.id),
    with: { projects: true, owner: true, portfolio: true },
    orderBy: (program, { desc }) => [desc(program.createdAt)],
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Programs</h1>
        {ctx.role === "admin" && (
          <Link
            href="/dashboard/programs/new"
            className="rounded bg-gray-900 px-4 py-2 text-sm text-white"
          >
            New Program
          </Link>
        )}
      </div>

      {orgPrograms.length === 0 ? (
        <p className="text-sm text-gray-500">No programs yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {orgPrograms.map((program) => (
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
                  {program.portfolio && `${program.portfolio.name} · `}
                  {program.projects.length} project{program.projects.length === 1 ? "" : "s"}
                  {program.owner && ` · Owner: ${program.owner.name}`}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
