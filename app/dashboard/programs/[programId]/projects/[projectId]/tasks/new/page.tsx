import { notFound } from "next/navigation";
import { requireOrgContext } from "@/lib/org";
import { getOrgMembers, getProjectForProgram, getTaskCustomFieldDefs } from "@/lib/queries";
import { TaskForm } from "@/components/tasks/task-form";
import { createTask } from "../actions";

export default async function NewTaskPage({
  params,
}: {
  params: Promise<{ programId: string; projectId: string }>;
}) {
  const { programId, projectId } = await params;
  const ctx = await requireOrgContext();

  const project = await getProjectForProgram(projectId, programId, ctx.org.id);
  if (!project) notFound();

  const [members, fieldDefs] = await Promise.all([
    getOrgMembers(ctx.org.id),
    getTaskCustomFieldDefs(programId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">New Task in {project.name}</h1>
      <TaskForm
        action={createTask.bind(null, programId, projectId)}
        orgMembers={members}
        fieldDefs={fieldDefs}
        submitLabel="Create Task"
      />
    </div>
  );
}
