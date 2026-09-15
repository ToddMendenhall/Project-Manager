import { priorityLabel, statusLabel } from "@/lib/fields";

export const STATUS_TOKENS: Record<string, { bg: string; text: string; dot: string }> = {
  not_started: { bg: "bg-cy-gray-050", text: "text-cy-gray-700", dot: "bg-cy-gray-300" },
  in_progress: { bg: "bg-cy-blue-100", text: "text-cy-blue-800", dot: "bg-cy-blue-600" },
  blocked: { bg: "bg-cy-red-100", text: "text-cy-red-600", dot: "bg-cy-red-500" },
  completed: { bg: "bg-cy-green-100", text: "text-cy-green-600", dot: "bg-cy-green-500" },
  cancelled: { bg: "bg-cy-gray-050", text: "text-cy-gray-400 line-through", dot: "bg-cy-gray-300" },
};

export const PRIORITY_TOKENS: Record<string, { bg: string; text: string; border?: string }> = {
  low: { bg: "bg-cy-gray-050", text: "text-cy-gray-500" },
  medium: { bg: "bg-cy-amber-100", text: "text-cy-amber-600" },
  high: { bg: "bg-cy-amber-100", text: "text-cy-amber-600", border: "border border-cy-amber-400" },
  urgent: { bg: "bg-cy-red-100", text: "text-cy-red-600" },
};

// Kept as flat class strings (rather than STATUS_TOKENS) for callers that
// build a single className, e.g. native <select> backgrounds in inline
// editors, where a dot span isn't an option.
export const STATUS_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(STATUS_TOKENS).map(([key, t]) => [key, `${t.bg} ${t.text}`]),
);
export const PRIORITY_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(PRIORITY_TOKENS).map(([key, t]) => [key, `${t.bg} ${t.text}`]),
);

// Solid fills (vs. the soft badge tints above) for bar charts, where the
// color needs to read against the chart's gray track background.
export const STATUS_BAR_COLORS: Record<string, string> = {
  not_started: "bg-cy-gray-300",
  in_progress: "bg-cy-blue-600",
  blocked: "bg-cy-red-500",
  completed: "bg-cy-green-500",
  cancelled: "bg-cy-gray-200",
};

export const PRIORITY_BAR_COLORS: Record<string, string> = {
  low: "bg-cy-gray-300",
  medium: "bg-cy-amber-400",
  high: "bg-cy-amber-500",
  urgent: "bg-cy-red-500",
};

export function StatusBadge({ status }: { status: string }) {
  const token = STATUS_TOKENS[status] ?? STATUS_TOKENS.not_started;
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[.08em] ${token.bg} ${token.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${token.dot}`} />
      {statusLabel(status)}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const token = PRIORITY_TOKENS[priority] ?? PRIORITY_TOKENS.low;
  return (
    <span
      className={`inline-flex w-fit items-center rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[.08em] ${token.bg} ${token.text} ${token.border ?? ""}`}
    >
      {priorityLabel(priority)}
    </span>
  );
}
