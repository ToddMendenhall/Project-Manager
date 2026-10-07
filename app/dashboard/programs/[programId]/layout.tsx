import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { isUuid } from "@/lib/ids";

/** A malformed id in the URL is a 404, not a database error (see lib/ids.ts). */
export default async function Layout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ programId: string }>;
}) {
  if (!isUuid((await params).programId)) notFound();
  return children;
}
