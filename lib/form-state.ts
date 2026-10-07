/** What a form's server action returns when it can't save: a form-level message and/or per-field messages. */
export type FormState = { error?: string; fieldErrors?: Record<string, string> } | null;
