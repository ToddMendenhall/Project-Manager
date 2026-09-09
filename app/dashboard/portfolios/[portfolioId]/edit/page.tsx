import { notFound, redirect } from "next/navigation";
import { requireOrgContext } from "@/lib/org";
import { getOrgMembers, getPortfolioForOrg } from "@/lib/queries";
import { PortfolioForm } from "@/components/portfolios/portfolio-form";
import { updatePortfolio } from "../../actions";

export default async function EditPortfolioPage({
  params,
}: {
  params: Promise<{ portfolioId: string }>;
}) {
  const { portfolioId } = await params;
  const ctx = await requireOrgContext();
  if (ctx.role !== "admin") redirect(`/dashboard/portfolios/${portfolioId}`);

  const portfolio = await getPortfolioForOrg(portfolioId, ctx.org.id);
  if (!portfolio) notFound();

  const members = await getOrgMembers(ctx.org.id);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Edit {portfolio.name}</h1>
      <PortfolioForm
        action={updatePortfolio.bind(null, portfolio.id)}
        portfolio={portfolio}
        orgMembers={members}
        submitLabel="Save changes"
      />
    </div>
  );
}
