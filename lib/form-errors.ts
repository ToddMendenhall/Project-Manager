import "server-only";
import { ZodError } from "zod";
import { ValidationError } from "@/lib/validation";
import type { FormState } from "@/lib/form-state";

/**
 * For a form action's catch block: a zod or `ValidationError` becomes a
 * FormState for the form to show. Anything else, including Next's own
 * redirect "error" on success, is rethrown untouched.
 */
export function formErrorState(err: unknown): FormState {
  if (err instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of err.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: "Please fix the highlighted fields.", fieldErrors };
  }
  if (err instanceof ValidationError) {
    return err.field ? { error: err.message, fieldErrors: { [err.field]: err.message } } : { error: err.message };
  }
  throw err;
}
