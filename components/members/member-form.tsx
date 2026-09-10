"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Field, inputClass, selectClass } from "@/components/form-controls";
import type { ActionResult } from "@/app/dashboard/members/actions";

export function MemberForm({
  action,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await action(formData);
      if (result.ok) {
        router.push("/dashboard/members");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-md flex-col gap-4">
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

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="w-fit rounded bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {isPending ? "Creating..." : submitLabel}
      </button>
    </form>
  );
}
