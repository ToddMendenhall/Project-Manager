import { notFound, redirect } from "next/navigation";
import { requireOrgContext } from "@/lib/org";
import { getOrgMembers, getProgramForOrg } from "@/lib/queries";
import { ProgramForm } from "@/components/programs/program-form";
import { updateProgram } from "../../actions";

export default async function EditProgramPage({
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
      <h1 className="text-xl font-semibold">Edit {program.name}</h1>
      <ProgramForm
        action={updateProgram.bind(null, program.id)}
        program={program}
        orgMembers={members}
        submitLabel="Save changes"
      />
    </div>
  );
}
