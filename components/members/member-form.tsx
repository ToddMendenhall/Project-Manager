"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Field, inputClass, selectClass } from "@/components/form-controls";
import { PasswordField } from "@/components/members/password-field";
import { PasswordReveal } from "@/components/members/password-reveal";
import type { ActionResult } from "@/app/dashboard/members/actions";

export function MemberForm({
  action,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [created, setCreated] = useState<{ name: string; email: string; password: string } | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    const name = String(formData.get("name") ?? "");
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    startTransition(async () => {
      const result = await action(formData);
      if (result.ok) {
        setCreated({ name, email, password });
      } else {
        setError(result.error);
      }
    });
  }

  if (created) {
    return (
      <div className="flex max-w-md flex-col gap-4 rounded border border-amber-300 bg-amber-50 p-4">
        <div>
          <p className="font-medium text-amber-900">Account created for {created.name}</p>
          <p className="text-sm text-amber-800">{created.email}</p>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-amber-900">
            Password — copy it now, it won&apos;t be shown again:
          </p>
          <PasswordReveal password={created.password} />
        </div>
        <Link href="/dashboard/members" className="w-fit rounded bg-gray-900 px-4 py-2 text-sm text-white">
          Done
        </Link>
      </div>
    );
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
        <PasswordField name="password" required minLength={8} className={inputClass} />
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
