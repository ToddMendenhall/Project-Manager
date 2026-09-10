import { Field, inputClass, selectClass, textareaClass } from "@/components/form-controls";
import { PRIORITY_OPTIONS, STATUS_OPTIONS } from "@/lib/fields";
import { customFieldName, customFieldOptions } from "@/lib/custom-fields";
import type { CustomFieldDef, Task } from "@/db/schema";

type OrgMember = { id: string; name: string; email: string };

function dateValue(d: Date | string | null | undefined) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}

function CustomFieldInput({ def, value }: { def: CustomFieldDef; value: unknown }) {
  const name = customFieldName(def.key);

  if (def.fieldType === "boolean") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name={name} defaultChecked={value === true} className="h-4 w-4" />
        {def.label}
      </label>
    );
  }

  if (def.fieldType === "select") {
    return (
      <Field label={def.label}>
        <select name={name} defaultValue={typeof value === "string" ? value : ""} className={selectClass}>
          <option value="">—</option>
          {customFieldOptions(def).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </Field>
    );
  }

  if (def.fieldType === "number") {
    return (
      <Field label={def.label}>
        <input
          type="number"
          name={name}
          defaultValue={typeof value === "number" ? value : ""}
          className={inputClass}
        />
      </Field>
    );
  }

  if (def.fieldType === "date") {
    return (
      <Field label={def.label}>
        <input type="date" name={name} defaultValue={typeof value === "string" ? value : ""} className={inputClass} />
      </Field>
    );
  }

  return (
    <Field label={def.label}>
      <input type="text" name={name} defaultValue={typeof value === "string" ? value : ""} className={inputClass} />
    </Field>
  );
}

export function TaskForm({
  action,
  task,
  orgMembers,
  fieldDefs,
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  task?: Task;
  orgMembers: OrgMember[];
  fieldDefs: CustomFieldDef[];
  submitLabel: string;
}) {
  const customValues = (task?.customFields as Record<string, unknown> | undefined) ?? {};

  return (
    <form action={action} className="flex max-w-xl flex-col gap-4">
      <Field label="Title">
        <input name="title" required defaultValue={task?.title} className={inputClass} />
      </Field>
      <Field label="Description">
        <textarea name="description" defaultValue={task?.description ?? ""} className={textareaClass} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Status">
          <select name="status" defaultValue={task?.status ?? "not_started"} className={selectClass}>
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Priority">
          <select name="priority" defaultValue={task?.priority ?? "medium"} className={selectClass}>
            {PRIORITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Assignee">
        <select name="assigneeId" defaultValue={task?.assigneeId ?? ""} className={selectClass}>
          <option value="">Unassigned</option>
          {orgMembers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} ({m.email})
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Start date">
          <input type="date" name="startDate" defaultValue={dateValue(task?.startDate)} className={inputClass} />
        </Field>
        <Field label="Due date">
          <input type="date" name="dueDate" defaultValue={dateValue(task?.dueDate)} className={inputClass} />
        </Field>
      </div>

      {fieldDefs.length > 0 && (
        <div className="flex flex-col gap-4 border-t border-gray-200 pt-4">
          <p className="text-sm font-medium text-gray-500">Custom fields</p>
          {fieldDefs.map((def) => (
            <CustomFieldInput key={def.id} def={def} value={customValues[def.key]} />
          ))}
        </div>
      )}

      <button type="submit" className="w-fit rounded bg-gray-900 px-4 py-2 text-sm text-white">
        {submitLabel}
      </button>
    </form>
  );
}
