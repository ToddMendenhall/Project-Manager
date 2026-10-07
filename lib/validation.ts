/**
 * An input problem the user can fix (a bad date, someone who isn't in the
 * org). Form actions turn it into a message on the form (`formErrorState`,
 * lib/form-errors.ts) instead of an error page. Anything else that's thrown
 * is a real failure and still goes to the error boundary.
 */
export class ValidationError extends Error {
  readonly field?: string;
  constructor(message: string, field?: string) {
    super(message);
    this.name = "ValidationError";
    this.field = field;
  }
}
