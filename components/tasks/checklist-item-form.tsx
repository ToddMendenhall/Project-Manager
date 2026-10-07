import { Field, inputClass, selectClass, textareaClass } from "@/components/form-controls";
import { PRIORITY_OPTIONS, STATUS_OPTIONS, dateInputValue } from "@/lib/fields";
import type { ChecklistItem } from "@/db/schema";
import { ActionForm, FieldError } from "@/components/action-form";
import type { FormState } from "@/lib/form-state";

type OrgMember = { id: string; name: string; email: string };

export function ChecklistItemForm({
  action,
  item,
  orgMembers,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<FormState | void>;
  item?: ChecklistItem;
  orgMembers: OrgMember[];
  submitLabel: string;
}) {
  return (
    <ActionForm action={action} submitLabel={submitLabel} className="flex max-w-xl flex-col gap-4">
      <Field label="Title">
        <input name="title" required defaultValue={item?.title} className={inputClass} />
        <FieldError name="title" />
      </Field>
      <Field label="Description">
        <textarea name="description" defaultValue={item?.description ?? ""} className={textareaClass} />
        <FieldError name="description" />
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

    </ActionForm>
  );
}
