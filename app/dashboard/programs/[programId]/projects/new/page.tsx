import { notFound, redirect } from "next/navigation";
import { requireOrgContext } from "@/lib/org";
import { getOrgMembers, getProgramForOrg } from "@/lib/queries";
import { ProjectForm } from "@/components/projects/project-form";
import { createProject } from "../actions";

export default async function NewProjectPage({
  params,
}: {
  params: Promise<{ programId: string }>;
}) {
  const { programId } = await params;
  const ctx = await requireOrgContext();
  if (ctx.role !== "admin") redirect(`/dashboard/programs/${programId}`);

  const program = await getProgramForOrg(programId, ctx.org.id);
  if (!program) notFound();

  const members = await getOrgMembers(ctx.org.id);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">New Project in {program.name}</h1>
      <ProjectForm
        action={createProject.bind(null, programId)}
        orgMembers={members}
        submitLabel="Create Project"
      />
    </div>
  );
}
