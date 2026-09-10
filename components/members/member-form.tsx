import { Field, inputClass, selectClass } from "@/components/form-controls";

export function MemberForm({
  action,
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
}) {
  return (
    <form action={action} className="flex max-w-md flex-col gap-4">
      <Field label="Name">
        <input name="name" required className={inputClass} />
      </Field>
      <Field label="Email">
        <input type="email" name="email" required className={inputClass} />
      </Field>
      <Field
        label="Password"
        hint="At least 8 characters. There's no email invite yet — share this with them directly."
      >
        <input type="password" name="password" required minLength={8} className={inputClass} />
      </Field>
      <Field label="Role">
        <select name="role" defaultValue="member" className={selectClass}>
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
      </Field>

      <button type="submit" className="w-fit rounded bg-gray-900 px-4 py-2 text-sm text-white">
        {submitLabel}
      </button>
    </form>
  );
}
