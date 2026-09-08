import { redirect } from "next/navigation";
import { requireOrgContext } from "@/lib/org";
import { getOrgMembers } from "@/lib/queries";
import { ProgramForm } from "@/components/programs/program-form";
import { createProgram } from "../actions";

export default async function NewProgramPage() {
  const ctx = await requireOrgContext();
  if (ctx.role !== "admin") redirect("/dashboard/programs");

  const members = await getOrgMembers(ctx.org.id);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">New Program</h1>
      <ProgramForm action={createProgram} orgMembers={members} submitLabel="Create Program" />
    </div>
  );
}
