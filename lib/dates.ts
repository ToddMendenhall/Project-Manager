/**
 * Parses an optional date string from a form field or an inline editor.
 * Empty means "no date". A non-empty string that isn't a date throws here,
 * with a clear message, rather than reaching the database driver as an
 * Invalid Date (which fails later with an opaque RangeError).
 */
export function toDateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${JSON.stringify(value).slice(0, 40)}`);
  }
  return date;
}
