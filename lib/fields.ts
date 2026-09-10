export const STATUS_OPTIONS = [
  { value: "not_started", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "blocked", label: "Blocked" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
] as const;

export const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
] as const;

export type StatusValue = (typeof STATUS_OPTIONS)[number]["value"];
export type PriorityValue = (typeof PRIORITY_OPTIONS)[number]["value"];

export function statusLabel(value: string) {
  return STATUS_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export function priorityLabel(value: string) {
  return PRIORITY_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

/** Formats a date for an <input type="date"> value/defaultValue. */
export function dateInputValue(d: Date | string | null | undefined) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}
