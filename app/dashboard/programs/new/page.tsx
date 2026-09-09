import { redirect } from "next/navigation";
import { requireOrgContext } from "@/lib/org";
import { getOrgMembers, getOrgPortfolios } from "@/lib/queries";
import { ProgramForm } from "@/components/programs/program-form";
import { createProgram } from "../actions";

export default async function NewProgramPage({
  searchParams,
}: {
  searchParams: Promise<{ portfolioId?: string }>;
}) {
  const ctx = await requireOrgContext();
  if (ctx.role !== "admin") redirect("/dashboard/programs");

  const { portfolioId } = await searchParams;
  const [members, portfolios] = await Promise.all([
    getOrgMembers(ctx.org.id),
    getOrgPortfolios(ctx.org.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">New Program</h1>
      <ProgramForm
        action={createProgram}
        orgMembers={members}
        portfolios={portfolios}
        initialPortfolioId={portfolioId}
        submitLabel="Create Program"
      />
    </div>
  );
}
