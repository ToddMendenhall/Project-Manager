"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { whiteboards } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { getWhiteboardForOrg } from "@/lib/queries";
import {
  MAX_WHITEBOARD_BYTES,
  canDeleteWhiteboard,
  parseStoredWhiteboardDoc,
  whiteboardDocSchema,
} from "@/lib/whiteboard";

const nameSchema = z.string().trim().min(1, "Name is required").max(255);

// The list panel lives in whiteboards/layout.tsx, so every mutation that
// changes a name or the most-recently-edited order revalidates the layout.
function revalidateWhiteboards() {
  revalidatePath("/dashboard/whiteboards", "layout");
}

export async function createWhiteboard() {
  const ctx = await requireOrgContext();

  const [board] = await db
    .insert(whiteboards)
    .values({
      orgId: ctx.org.id,
      name: "Untitled whiteboard",
      createdById: ctx.user.id,
      updatedById: ctx.user.id,
    })
    .returning({ id: whiteboards.id });

  revalidateWhiteboards();
  redirect(`/dashboard/whiteboards/${board.id}`);
}

export async function renameWhiteboard(whiteboardId: string, name: string) {
  const ctx = await requireOrgContext();

  const existing = await getWhiteboardForOrg(whiteboardId, ctx.org.id);
  if (!existing) {
    throw new Error("Whiteboard not found");
  }

  // A rename doesn't bump `version` — it never conflicts with canvas edits.
  await db
    .update(whiteboards)
    .set({ name: nameSchema.parse(name), updatedAt: new Date(), updatedById: ctx.user.id })
    .where(eq(whiteboards.id, whiteboardId));

  revalidateWhiteboards();
}

export async function duplicateWhiteboard(whiteboardId: string) {
  const ctx = await requireOrgContext();

  const existing = await getWhiteboardForOrg(whiteboardId, ctx.org.id, { withData: true });
  if (!existing) {
    throw new Error("Whiteboard not found");
  }

  const [copy] = await db
    .insert(whiteboards)
    .values({
      orgId: ctx.org.id,
      name: `Copy of ${existing.name}`.slice(0, 255),
      data: parseStoredWhiteboardDoc(existing.data),
      createdById: ctx.user.id,
      updatedById: ctx.user.id,
    })
    .returning({ id: whiteboards.id });

  revalidateWhiteboards();
  redirect(`/dashboard/whiteboards/${copy.id}`);
}

/** Creator or admin only. Redirects to the list, so it works from the board itself or the list page. */
export async function deleteWhiteboard(whiteboardId: string) {
  const ctx = await requireOrgContext();

  const existing = await getWhiteboardForOrg(whiteboardId, ctx.org.id);
  if (!existing) {
    throw new Error("Whiteboard not found");
  }
  if (!canDeleteWhiteboard(existing, ctx)) {
    throw new Error("Forbidden: only the whiteboard's creator or an admin can delete it");
  }

  await db.delete(whiteboards).where(eq(whiteboards.id, whiteboardId));

  revalidateWhiteboards();
  redirect("/dashboard/whiteboards");
}

export type SaveWhiteboardResult =
  | { ok: true; version: number }
  | { ok: false; reason: "conflict"; version: number; updatedByName: string | null }
  | { ok: false; reason: "invalid" | "too_large"; message: string };

/**
 * Autosave. `expectedVersion` is the version the editor last loaded or
 * saved; the update only applies if the row is still at that version, so
 * a save racing someone else's comes back as a conflict (with who saved)
 * instead of overwriting their work. The editor resolves a conflict by
 * either reloading, or calling this again with the newer version to
 * overwrite deliberately.
 */
export async function saveWhiteboard(
  whiteboardId: string,
  doc: unknown,
  expectedVersion: number,
): Promise<SaveWhiteboardResult> {
  const ctx = await requireOrgContext();

  const existing = await getWhiteboardForOrg(whiteboardId, ctx.org.id);
  if (!existing) {
    throw new Error("Whiteboard not found");
  }

  if (JSON.stringify(doc).length > MAX_WHITEBOARD_BYTES) {
    return { ok: false, reason: "too_large", message: "This whiteboard is too large to save." };
  }
  const parsed = whiteboardDocSchema.safeParse(doc);
  if (!parsed.success) {
    return { ok: false, reason: "invalid", message: parsed.error.issues[0]?.message ?? "Invalid whiteboard" };
  }
  const version = z.number().int().parse(expectedVersion);

  const [updated] = await db
    .update(whiteboards)
    .set({
      data: parsed.data,
      version: version + 1,
      updatedAt: new Date(),
      updatedById: ctx.user.id,
    })
    .where(
      and(
        eq(whiteboards.id, whiteboardId),
        eq(whiteboards.orgId, ctx.org.id),
        eq(whiteboards.version, version),
      ),
    )
    .returning({ version: whiteboards.version });

  if (!updated) {
    const current = await getWhiteboardForOrg(whiteboardId, ctx.org.id);
    if (!current) {
      throw new Error("Whiteboard not found");
    }
    return {
      ok: false,
      reason: "conflict",
      version: current.version,
      updatedByName: current.updatedBy?.name ?? null,
    };
  }

  revalidateWhiteboards();
  return { ok: true, version: updated.version };
}

/** Polled by an open editor to notice someone else's save. */
export async function getWhiteboardVersion(whiteboardId: string) {
  const ctx = await requireOrgContext();

  const existing = await getWhiteboardForOrg(whiteboardId, ctx.org.id);
  if (!existing) {
    return null;
  }
  return { version: existing.version, updatedByName: existing.updatedBy?.name ?? null };
}
