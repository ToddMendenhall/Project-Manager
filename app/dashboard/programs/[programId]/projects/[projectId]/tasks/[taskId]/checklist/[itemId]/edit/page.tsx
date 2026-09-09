import { notFound } from "next/navigation";
import { requireOrgContext } from "@/lib/org";
import { getChecklistItemForTask, getOrgMembers } from "@/lib/queries";
import { ChecklistItemForm } from "@/components/tasks/checklist-item-form";
import { updateChecklistItem } from "../../actions";

export default async function EditChecklistItemPage({
  params,
}: {
  params: Promise<{ programId: string; projectId: string; taskId: string; itemId: string }>;
}) {
  const { programId, projectId, taskId, itemId } = await params;
  const ctx = await requireOrgContext();

  const item = await getChecklistItemForTask(itemId, taskId, projectId, programId, ctx.org.id);
  if (!item) notFound();

  const members = await getOrgMembers(ctx.org.id);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Edit {item.title}</h1>
      <ChecklistItemForm
        action={updateChecklistItem.bind(null, programId, projectId, taskId, itemId)}
        item={item}
        orgMembers={members}
        submitLabel="Save changes"
      />
    </div>
  );
}
