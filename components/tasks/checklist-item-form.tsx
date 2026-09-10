import { Field, inputClass, selectClass, textareaClass } from "@/components/form-controls";
import { PRIORITY_OPTIONS, STATUS_OPTIONS, dateInputValue } from "@/lib/fields";
import type { ChecklistItem } from "@/db/schema";

type OrgMember = { id: string; name: string; email: string };

export function ChecklistItemForm({
  action,
  item,
  orgMembers,
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  item?: ChecklistItem;
  orgMembers: OrgMember[];
  submitLabel: string;
}) {
  return (
    <form action={action} className="flex max-w-xl flex-col gap-4">
      <Field label="Title">
        <input name="title" required defaultValue={item?.title} className={inputClass} />
      </Field>
      <Field label="Description">
        <textarea name="description" defaultValue={item?.description ?? ""} className={textareaClass} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Status">
          <select name="status" defaultValue={item?.status ?? "not_started"} className={selectClass}>
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Priority">
          <select name="priority" defaultValue={item?.priority ?? "medium"} className={selectClass}>
            {PRIORITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Assignee">
        <select name="assigneeId" defaultValue={item?.assigneeId ?? ""} className={selectClass}>
          <option value="">Unassigned</option>
          {orgMembers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} ({m.email})
            </option>
          ))}
        </select>
      </Field>
      <Field label="Due date">
        <input type="date" name="dueDate" defaultValue={dateInputValue(item?.dueDate)} className={inputClass} />
      </Field>

      <button type="submit" className="w-fit rounded bg-gray-900 px-4 py-2 text-sm text-white">
        {submitLabel}
      </button>
    </form>
  );
}
