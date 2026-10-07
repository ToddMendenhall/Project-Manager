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

/*
 * Calendar dates (start, due, target end) are stored as midnight UTC of the
 * chosen day. Read them with UTC getters or a UTC timeZone, never with local
 * getters or a plain toLocaleDateString(): west of UTC, midnight UTC is still
 * the previous day locally, so the date would show (and, in the Gantt, save)
 * one day early. These helpers are safe on the server and in the browser.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** A stored calendar date as "YYYY-MM-DD". */
export function calendarDateKey(value: Date | string): string {
  const d = new Date(value);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Today's date where the code runs (the viewer's day in the browser), as "YYYY-MM-DD". */
export function todayKey(now = new Date()): string {
  return localDateKey(now);
}

/**
 * A stored calendar date as a local-midnight Date of the same day, for
 * day arithmetic in local time (the Gantt's grid). Convert back with
 * `localDateKey`, not `toISOString()`.
 */
export function toLocalCalendarDate(value: Date | string): Date {
  const d = new Date(value);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** A local-midnight Date (see `toLocalCalendarDate`) as "YYYY-MM-DD", what the date actions expect. */
export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * A stored calendar date for display, e.g. "9/15/2026". Fixed to en-US and
 * UTC so the server render and every browser produce the same text (a
 * mismatch would also break hydration).
 */
export function formatCalendarDate(
  value: Date | string | null | undefined,
  options: Intl.DateTimeFormatOptions = {},
): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
}

/** A local-midnight Date (see `toLocalCalendarDate`) for display, e.g. "9/15/2026". */
export function formatLocalDate(d: Date, options: Intl.DateTimeFormatOptions = {}): string {
  return d.toLocaleDateString("en-US", options);
}
