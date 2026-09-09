import { Field, inputClass, selectClass, textareaClass } from "@/components/form-controls";
import { STATUS_OPTIONS } from "@/lib/fields";
import type { Portfolio } from "@/db/schema";

type OrgMember = { id: string; name: string; email: string };

function dateValue(d: Date | string | null | undefined) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}

export function PortfolioForm({
  action,
  portfolio,
  orgMembers,
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  portfolio?: Portfolio;
  orgMembers: OrgMember[];
  submitLabel: string;
}) {
  return (
    <form action={action} className="flex max-w-xl flex-col gap-4">
      <Field label="Name">
        <input name="name" required defaultValue={portfolio?.name} className={inputClass} />
      </Field>
      <Field label="Description">
        <textarea name="description" defaultValue={portfolio?.description ?? ""} className={textareaClass} />
      </Field>
      <Field label="Status">
        <select name="status" defaultValue={portfolio?.status ?? "not_started"} className={selectClass}>
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Owner">
        <select name="ownerId" defaultValue={portfolio?.ownerId ?? ""} className={selectClass}>
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
            defaultValue={dateValue(portfolio?.startDate)}
            className={inputClass}
          />
        </Field>
        <Field label="Target end date">
          <input
            type="date"
            name="targetEndDate"
            defaultValue={dateValue(portfolio?.targetEndDate)}
            className={inputClass}
          />
        </Field>
      </div>
      <button type="submit" className="w-fit rounded bg-gray-900 px-4 py-2 text-sm text-white">
        {submitLabel}
      </button>
    </form>
  );
}
