import { Field, inputClass, selectClass, textareaClass } from "@/components/form-controls";
import { PRIORITY_OPTIONS, STATUS_OPTIONS } from "@/lib/fields";
import type { Project } from "@/db/schema";

type OrgMember = { id: string; name: string; email: string };

function dateValue(d: Date | string | null | undefined) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}

export function ProjectForm({
  action,
  project,
  orgMembers,
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  project?: Project;
  orgMembers: OrgMember[];
  submitLabel: string;
}) {
  return (
    <form action={action} className="flex max-w-xl flex-col gap-4">
      <Field label="Name">
        <input name="name" required defaultValue={project?.name} className={inputClass} />
      </Field>
      <Field label="Description">
        <textarea name="description" defaultValue={project?.description ?? ""} className={textareaClass} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Status">
          <select name="status" defaultValue={project?.status ?? "not_started"} className={selectClass}>
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Priority">
          <select name="priority" defaultValue={project?.priority ?? "medium"} className={selectClass}>
            {PRIORITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Lead">
        <select name="leadId" defaultValue={project?.leadId ?? ""} className={selectClass}>
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
          <input
            type="date"
            name="startDate"
            defaultValue={dateValue(project?.startDate)}
            className={inputClass}
          />
        </Field>
        <Field label="Due date">
          <input type="date" name="dueDate" defaultValue={dateValue(project?.dueDate)} className={inputClass} />
        </Field>
      </div>
      <button type="submit" className="w-fit rounded bg-gray-900 px-4 py-2 text-sm text-white">
        {submitLabel}
      </button>
    </form>
  );
}
