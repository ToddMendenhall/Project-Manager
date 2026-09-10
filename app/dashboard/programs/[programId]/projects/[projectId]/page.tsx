import Link from "next/link";
import { notFound } from "next/navigation";
import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { programs, projects, tasks } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { PriorityBadge, StatusBadge } from "@/components/status-badge";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { ViewTabs } from "@/components/views/view-tabs";
import { ItemHeader, type ItemHeaderMeta } from "@/components/views/item-header";
import { deleteProject } from "../actions";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ programId: string; projectId: string }>;
}) {
  const { programId, projectId } = await params;
  const ctx = await requireOrgContext();

  const program = await db.query.programs.findFirst({
    where: and(eq(programs.id, programId), eq(programs.orgId, ctx.org.id)),
  });
  if (!program) notFound();

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.programId, programId)),
    with: {
      lead: true,
      tasks: { orderBy: (task, { desc }) => [desc(task.createdAt)], limit: 5 },
    },
  });
  if (!project) notFound();

  const [{ value: taskCount }] = await db
    .select({ value: count() })
    .from(tasks)
    .where(eq(tasks.projectId, projectId));

  const meta: ItemHeaderMeta[] = [];
  if (project.lead) meta.push({ label: "Lead", value: project.lead.name });
  if (project.startDate) meta.push({ label: "Start", value: new Date(project.startDate).toLocaleDateString() });
  if (project.dueDate) meta.push({ label: "Due", value: new Date(project.dueDate).toLocaleDateString() });

  return (
    <div className="flex flex-col gap-8">
      <ItemHeader
        backHref={`/dashboard/programs/${program.id}`}
        backLabel={program.name}
        name={project.name}
        badges={
          <>
            <StatusBadge status={project.status} />
            <PriorityBadge priority={project.priority} />
          </>
        }
        description={project.description}
        meta={meta}
        action={
          ctx.role === "admin" ? (
            <>
              <Link
                href={`/dashboard/programs/${programId}/projects/${project.id}/edit`}
                className="text-sm underline"
              >
                Edit
              </Link>
              <ConfirmDeleteButton
                action={deleteProject.bind(null, programId, project.id)}
                confirmMessage={`Delete "${project.name}" and all of its tasks? This cannot be undone.`}
              />
            </>
          ) : undefined
        }
      />

      <ViewTabs
        basePath={`/dashboard/programs/${programId}/projects/${project.id}`}
        active="overview"
        hrefs={{ list: `/dashboard/programs/${programId}/projects/${project.id}/tasks` }}
      />

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Tasks ({taskCount})</h2>
          <Link
            href={`/dashboard/programs/${programId}/projects/${project.id}/tasks/new`}
            className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white"
          >
            New Task
          </Link>
        </div>
        {project.tasks.length === 0 ? (
          <p className="text-sm text-gray-500">No tasks yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {project.tasks.map((task) => (
              <li key={task.id}>
                <Link
                  href={`/dashboard/programs/${programId}/projects/${project.id}/tasks/${task.id}`}
                  className="flex items-center justify-between rounded border border-gray-200 bg-white p-3 text-sm hover:border-gray-400"
                >
                  <span>{task.title}</span>
                  <span className="flex gap-2">
                    <PriorityBadge priority={task.priority} />
                    <StatusBadge status={task.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
