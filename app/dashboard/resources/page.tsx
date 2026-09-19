import { requireOrgContext } from "@/lib/org";
import { getOrgMembersDetailed, getOrgTasksFlat } from "@/lib/queries";
import { buildResourceTree } from "@/lib/resource-gantt";
import { ResourceGanttView } from "@/components/views/resource-gantt-view";

export default async function ResourcesPage() {
  const ctx = await requireOrgContext();

  const [members, tasks] = await Promise.all([
    getOrgMembersDetailed(ctx.org.id),
    getOrgTasksFlat(ctx.org.id),
  ]);

  const memberNodes = buildResourceTree(
    members.map((m) => ({ userId: m.userId, name: m.name })),
    tasks,
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.01em] text-cy-gray-900">Resources</h1>
        <p className="mt-1 text-sm text-cy-gray-500">
          Every member&rsquo;s assignments across the org, in Gantt form. Expand a member to see the projects,
          tasks, and subtasks assigned to them.
        </p>
      </div>
      <ResourceGanttView members={memberNodes} />
    </div>
  );
}
