import { priorityLabel, statusLabel } from "@/lib/fields";

export const STATUS_COLORS: Record<string, string> = {
  not_started: "bg-gray-100 text-gray-700",
  in_progress: "bg-blue-100 text-blue-700",
  blocked: "bg-red-100 text-red-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-gray-100 text-gray-400 line-through",
};

export const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-gray-100 text-gray-600",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
};

// Solid fills (vs. the soft badge tints above) for bar charts, where the
// color needs to read against the chart's gray track background.
export const STATUS_BAR_COLORS: Record<string, string> = {
  not_started: "bg-gray-400",
  in_progress: "bg-blue-500",
  blocked: "bg-red-500",
  completed: "bg-green-500",
  cancelled: "bg-gray-300",
};

export const PRIORITY_BAR_COLORS: Record<string, string> = {
  low: "bg-gray-400",
  medium: "bg-amber-500",
  high: "bg-orange-500",
  urgent: "bg-red-500",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status] ?? "bg-gray-100 text-gray-700"}`}
    >
      {statusLabel(status)}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs font-medium ${PRIORITY_COLORS[priority] ?? "bg-gray-100 text-gray-700"}`}
    >
      {priorityLabel(priority)}
    </span>
  );
}
