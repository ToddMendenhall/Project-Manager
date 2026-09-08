import { notFound } from "next/navigation";
import { requireOrgContext } from "@/lib/org";
import { getOrgMembers, getTaskCustomFieldDefs, getTaskForProject } from "@/lib/queries";
import { TaskForm } from "@/components/tasks/task-form";
import { updateTask } from "../../actions";

export default async function EditTaskPage({
  params,
}: {
  params: Promise<{ programId: string; projectId: string; taskId: string }>;
}) {
  const { programId, projectId, taskId } = await params;
  const ctx = await requireOrgContext();

  const task = await getTaskForProject(taskId, projectId, programId, ctx.org.id);
  if (!task) notFound();

  const [members, fieldDefs] = await Promise.all([
    getOrgMembers(ctx.org.id),
    getTaskCustomFieldDefs(programId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Edit {task.title}</h1>
      <TaskForm
        action={updateTask.bind(null, programId, projectId, taskId)}
        task={task}
        orgMembers={members}
        fieldDefs={fieldDefs}
        submitLabel="Save changes"
      />
    </div>
  );
}
