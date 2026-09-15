import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOrgContext } from "@/lib/org";
import { getOrgAttachmentsDetailed, type OrgAttachmentRow } from "@/lib/queries";
import { formatBytes } from "@/lib/attachments";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { deleteAttachmentAdmin } from "./actions";

const SORTS = {
  oldest: { label: "Oldest first", compare: (a: OrgAttachmentRow, b: OrgAttachmentRow) => a.createdAt.getTime() - b.createdAt.getTime() },
  newest: { label: "Newest first", compare: (a: OrgAttachmentRow, b: OrgAttachmentRow) => b.createdAt.getTime() - a.createdAt.getTime() },
  largest: { label: "Largest first", compare: (a: OrgAttachmentRow, b: OrgAttachmentRow) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0) },
} as const;
type SortKey = keyof typeof SORTS;

function itemHref(row: OrgAttachmentRow) {
  const taskPath = `/dashboard/programs/${row.programId}/projects/${row.projectId}/tasks/${row.taskId}`;
  return row.itemKind === "checklist_item" ? `${taskPath}/checklist/${row.checklistItemId}` : taskPath;
}

export default async function AttachmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const ctx = await requireOrgContext();
  if (ctx.role !== "admin") redirect("/dashboard");

  const sp = await searchParams;
  const sortKey: SortKey = sp.sort === "newest" || sp.sort === "largest" ? sp.sort : "oldest";

  const rows = (await getOrgAttachmentsDetailed(ctx.org.id)).sort(SORTS[sortKey].compare);
  const totalBytes = rows.reduce((sum, row) => sum + (row.sizeBytes ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Attachments</h1>
        <p className="text-sm text-gray-500">
          Every file attached to a task or checklist item across {ctx.org.name}. Delete old ones here to free up
          database storage.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total Attachments" value={rows.length} />
        <StatCard label="Total Storage Used" value={formatBytes(totalBytes)} />
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">No attachments yet.</p>
      ) : (
        <div>
          <div className="mb-3 flex items-center gap-4 text-sm">
            <span className="text-gray-500">Sort:</span>
            {(Object.keys(SORTS) as SortKey[]).map((key) => (
              <Link
                key={key}
                href={`/dashboard/attachments?sort=${key}`}
                className={key === sortKey ? "font-medium text-gray-900 underline" : "text-gray-500 underline"}
              >
                {SORTS[key].label}
              </Link>
            ))}
          </div>

          <div className="overflow-x-auto rounded border border-gray-200 bg-white">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-gray-200 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">File</th>
                  <th className="px-4 py-3 font-medium">Attached To</th>
                  <th className="px-4 py-3 font-medium">Size</th>
                  <th className="px-4 py-3 font-medium">Uploaded By</th>
                  <th className="px-4 py-3 font-medium">Uploaded</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <a href={`/api/attachments/${row.id}`} className="font-medium text-gray-900 hover:underline">
                        {row.fileName}
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={itemHref(row)} className="text-gray-900 hover:underline">
                        {row.itemTitle}
                      </Link>
                      <div className="mt-1 flex items-center gap-2">
                        <StatusBadge status={row.itemStatus} />
                        <span className="text-xs text-gray-400">
                          {row.programName} / {row.projectName}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {row.sizeBytes != null ? formatBytes(row.sizeBytes) : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{row.uploadedByName}</td>
                    <td className="px-4 py-3 text-gray-600">{new Date(row.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right">
                      <ConfirmDeleteButton
                        action={deleteAttachmentAdmin.bind(null, row.id)}
                        confirmMessage={`Delete "${row.fileName}"? This cannot be undone.`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
