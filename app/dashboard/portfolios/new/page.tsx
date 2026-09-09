import { redirect } from "next/navigation";
import { requireOrgContext } from "@/lib/org";
import { getOrgMembers } from "@/lib/queries";
import { PortfolioForm } from "@/components/portfolios/portfolio-form";
import { createPortfolio } from "../actions";

export default async function NewPortfolioPage() {
  const ctx = await requireOrgContext();
  if (ctx.role !== "admin") redirect("/dashboard/portfolios");

  const members = await getOrgMembers(ctx.org.id);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">New Portfolio</h1>
      <PortfolioForm action={createPortfolio} orgMembers={members} submitLabel="Create Portfolio" />
    </div>
  );
}
