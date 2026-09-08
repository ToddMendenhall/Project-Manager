import { notFound, redirect } from "next/navigation";
import { requireOrgContext } from "@/lib/org";
import { getOrgMembers, getProjectForProgram } from "@/lib/queries";
import { ProjectForm } from "@/components/projects/project-form";
import { updateProject } from "../../actions";

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ programId: string; projectId: string }>;
}) {
  const { programId, projectId } = await params;
  const ctx = await requireOrgContext();
  if (ctx.role !== "admin") redirect(`/dashboard/programs/${programId}/projects/${projectId}`);

  const project = await getProjectForProgram(projectId, programId, ctx.org.id);
  if (!project) notFound();

  const members = await getOrgMembers(ctx.org.id);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Edit {project.name}</h1>
      <ProjectForm
        action={updateProject.bind(null, programId, projectId)}
        project={project}
        orgMembers={members}
        submitLabel="Save changes"
      />
    </div>
  );
}
