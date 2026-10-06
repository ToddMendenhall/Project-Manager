"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { whiteboards } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { getWhiteboardForOrg } from "@/lib/queries";
import {
  MAX_WHITEBOARD_BYTES,
  canDeleteWhiteboard,
  parseStoredWhiteboardDoc,
  whiteboardDocSchema,
  whiteboardImageIds,
  type WhiteboardDoc,
} from "@/lib/whiteboard";
import { WHITEBOARD_TEMPLATES, WHITEBOARD_TEMPLATE_KEYS } from "@/lib/whiteboard-templates";

const nameSchema = z.string().trim().min(1, "Name is required").max(255);

// The list panel lives in whiteboards/layout.tsx, so every mutation that
// changes a name or the most-recently-edited order revalidates the layout.
function revalidateWhiteboards() {
  revalidatePath("/dashboard/whiteboards", "layout");
}

export async function createWhiteboard(templateKey: string = "blank") {
  const ctx = await requireOrgContext();

  const key = z.enum(WHITEBOARD_TEMPLATE_KEYS as [string, ...string[]]).parse(templateKey);
  const template = WHITEBOARD_TEMPLATES[key as keyof typeof WHITEBOARD_TEMPLATES];

  const [board] = await db
    .insert(whiteboards)
    .values({
      orgId: ctx.org.id,
      name: key === "blank" ? "Untitled whiteboard" : template.name,
      data: whiteboardDocSchema.parse(template.build()),
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

  const doc = parseStoredWhiteboardDoc(existing.data);

  // Images belong to their board (deleted with it), so the copy gets its
  // own copies of the attachment rows, and its image nodes are re-pointed
  // at them. Ids with no matching row (already deleted) are left as-is and
  // render as a missing-image placeholder, same as on the original.
  const copy = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(whiteboards)
      .values({
        orgId: ctx.org.id,
        name: `Copy of ${existing.name}`.slice(0, 255),
        data: doc,
        thumbnail: sql`(select thumbnail from whiteboards where id = ${whiteboardId})`,
        thumbnailUpdatedAt: existing.thumbnailUpdatedAt,
        createdById: ctx.user.id,
        updatedById: ctx.user.id,
      })
      .returning({ id: whiteboards.id });

    const idMap = new Map<string, string>();
    for (const imageId of whiteboardImageIds(doc)) {
      const copied = await tx.execute<{ id: string }>(sql`
        insert into attachments (whiteboard_id, uploaded_by_id, file_name, data, content_type, size_bytes)
        select ${created.id}, ${ctx.user.id}, file_name, data, content_type, size_bytes
        from attachments where id = ${imageId} and whiteboard_id = ${whiteboardId}
        returning id`);
      const row = Array.from(copied)[0];
      if (row) idMap.set(imageId, row.id);
    }

    if (idMap.size > 0) {
      const remapped: WhiteboardDoc = {
        ...doc,
        nodes: doc.nodes.map((n) =>
          n.data.attachmentId && idMap.has(n.data.attachmentId)
            ? { ...n, data: { ...n.data, attachmentId: idMap.get(n.data.attachmentId)! } }
            : n,
        ),
      };
      await tx.update(whiteboards).set({ data: remapped }).where(eq(whiteboards.id, created.id));
    }
    return created;
  });

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
