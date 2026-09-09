// Generic month-grid math for the Calendar view — no date library needed.

/** 42 cells (6 weeks x 7 days), starting on the Sunday on/before the 1st. */
export function getMonthGridDays(year: number, monthIndex0: number): Date[] {
  const firstOfMonth = new Date(year, monthIndex0, 1);
  const gridStart = new Date(year, monthIndex0, 1 - firstOfMonth.getDay());

  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
}

export function toMonthParam(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function parseMonthParam(param: string | undefined): { year: number; monthIndex0: number } {
  if (param && /^\d{4}-\d{2}$/.test(param)) {
    const [year, month] = param.split("-").map(Number);
    return { year, monthIndex0: month - 1 };
  }
  const now = new Date();
  return { year: now.getFullYear(), monthIndex0: now.getMonth() };
}

/** Local-date key (not UTC) — matches how due dates are already displayed elsewhere. */
export function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
