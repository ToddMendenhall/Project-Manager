"use client";

import { createContext, useContext, useState, useTransition, type ReactNode } from "react";
import { isNextNavigationError } from "@/lib/next-errors";
import { buttonPrimary } from "@/components/form-controls";
import type { FormState } from "@/lib/form-state";

const FormStateContext = createContext<FormState>(null);

/**
 * A create/edit form whose server action returns a FormState when the input
 * can't be saved (see lib/form-errors.ts). The message shows at the top and
 * next to the field (`FieldError`), and what was typed stays put.
 *
 * It submits through onSubmit rather than a native `<form action>`. React 19
 * resets a form's fields after a form action, which would wipe the user's
 * input on a validation error. It also keeps to the one-native-form-per-page
 * rule. Success still ends in the action's redirect.
 */
export function ActionForm({
  action,
  submitLabel,
  className,
  children,
}: {
  action: (formData: FormData) => Promise<FormState | void>;
  submitLabel: string;
  className?: string;
  children: ReactNode;
}) {
  const [state, setState] = useState<FormState>(null);
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState(false);

  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        setPending(true);
        startTransition(() => {
          action(formData).then(
            (result) => {
              // A result means the save was refused; success navigates away.
              setState(result ?? null);
              setPending(false);
            },
            (err) => {
              if (isNextNavigationError(err)) return;
              setState({ error: "Couldn't save. Check your connection and try again." });
              setPending(false);
            },
          );
        });
      }}
    >
      <FormStateContext.Provider value={state}>
        {state?.error && (
          <p role="alert" className="rounded border border-cy-red-300 bg-cy-red-100 px-3 py-2 text-sm text-cy-red-600">
            {state.error}
          </p>
        )}
        {children}
      </FormStateContext.Provider>
      <button type="submit" disabled={pending} className={`w-fit ${buttonPrimary}`}>
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

/** The message for one field (by its input `name`), if the last save rejected it. */
export function FieldError({ name }: { name: string }) {
  const message = useContext(FormStateContext)?.fieldErrors?.[name];
  if (!message) return null;
  return <span className="text-xs font-medium text-cy-red-600">{message}</span>;
}
