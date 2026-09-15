import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/org";
import { searchOrg } from "@/lib/queries";

export async function GET(request: Request) {
  const ctx = await requireOrgContext();
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";

  if (!query) {
    return NextResponse.json({ tasks: [], projects: [], programs: [], members: [] });
  }

  const results = await searchOrg(ctx.org.id, query);
  return NextResponse.json(results);
}
