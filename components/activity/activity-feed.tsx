import type { ReactNode } from "react";
import { ACTIVITY_RETENTION_DAYS, type ActivityEntry } from "@/lib/activity";
import { priorityLabel, statusLabel } from "@/lib/fields";
import { formatRelativeTime } from "@/lib/whiteboard";

/** Shown before the rest fold into "Show N more". */
const INITIAL_VISIBLE = 10;

const TYPE_LABELS: Record<ActivityEntry["entityType"], string> = {
  program: "program",
  project: "project",
  task: "task",
  checklist_item: "checklist item",
  whiteboard: "whiteboard",
};

const FIELD_LABELS: Record<string, string> = {
  status: "status",
  priority: "priority",
  assignee: "assignee",
  owner: "owner",
  lead: "lead",
  startDate: "start date",
  dueDate: "due date",
  targetEndDate: "target end date",
};

/** Dates are stored as YYYY-MM-DD (midnight UTC), so format them in UTC to avoid an off-by-one day. */
function formatValue(field: string | null, value: string): string {
  if (field === "status") return statusLabel(value);
  if (field === "priority") return priorityLabel(value);
  if (field === "startDate" || field === "dueDate" || field === "targetEndDate") {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  }
  return value;
}

const Strong = ({ children }: { children: ReactNode }) => (
  <span className="font-medium text-cy-gray-900">{children}</span>
);

/** The sentence after the actor's name, e.g. `changed status of task "Spec" from To Do to Done`. */
function describe(entry: ActivityEntry, isSelf: boolean): ReactNode {
  const type = TYPE_LABELS[entry.entityType];
  // On an item's own page, "this task" reads better than repeating its name.
  const subject = isSelf ? (
    <>this {type}</>
  ) : (
    <>
      {type} <Strong>{entry.entityName}</Strong>
    </>
  );
  const of = isSelf ? null : <> of {subject}</>;

  switch (entry.action) {
    case "created":
      return <>created {subject}</>;
    case "deleted":
      return <>deleted {subject}</>;
    case "commented":
      return <>commented on {subject}</>;
    case "linked":
      return <>linked {subject}</>;
    case "unlinked":
      return <>unlinked {subject}</>;
    case "updated": {
      const oldValue = entry.oldValue === null ? null : formatValue(entry.field, entry.oldValue);
      const newValue = entry.newValue === null ? null : formatValue(entry.field, entry.newValue);
      if (entry.field === "name") {
        return (
          <>
            renamed {type} <Strong>{oldValue}</Strong> to <Strong>{newValue}</Strong>
          </>
        );
      }
      const label = FIELD_LABELS[entry.field ?? ""] ?? entry.field;
      if (oldValue === null) {
        return (
          <>
            set {label}
            {of} to <Strong>{newValue}</Strong>
          </>
        );
      }
      if (newValue === null) {
        return (
          <>
            cleared {label}
            {of} (was <Strong>{oldValue}</Strong>)
          </>
        );
      }
      return (
        <>
          changed {label}
          {of} from <Strong>{oldValue}</Strong> to <Strong>{newValue}</Strong>
        </>
      );
    }
  }
}

function ActivityItem({ entry, selfId, now }: { entry: ActivityEntry; selfId: string; now: Date }) {
  return (
    <li className="flex gap-3 text-sm">
      <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-cy-gray-200" />
      <div className="min-w-0 flex-1">
        <p className="text-cy-gray-600">
          <Strong>{entry.actor?.name ?? "A former member"}</Strong> {describe(entry, entry.entityId === selfId)}
          <span className="text-cy-gray-400"> · </span>
          <time
            dateTime={entry.createdAt.toISOString()}
            title={entry.createdAt.toLocaleString()}
            className="whitespace-nowrap text-xs text-cy-gray-400"
          >
            {formatRelativeTime(entry.createdAt, now)}
          </time>
        </p>
        {entry.action === "commented" && entry.newValue && (
          <p className="mt-1 truncate border-l-2 border-cy-gray-100 pl-2 text-cy-gray-500">{entry.newValue}</p>
        )}
      </div>
    </li>
  );
}

/**
 * The "Activity" section on a Program, Project or Task page (see
 * lib/activity.ts). `selfId` is the page's own item, whose events are
 * phrased as "this task" rather than by name.
 */
export function ActivityFeed({
  entries,
  hasMore,
  selfId,
}: {
  entries: ActivityEntry[];
  hasMore: boolean;
  selfId: string;
}) {
  const now = new Date();
  const visible = entries.slice(0, INITIAL_VISIBLE);
  const rest = entries.slice(INITIAL_VISIBLE);

  return (
    <section aria-labelledby="activity-heading">
      <h2 id="activity-heading" className="mb-3 text-lg font-semibold">
        Activity
      </h2>
      {entries.length === 0 ? (
        <p className="text-sm text-cy-gray-500">No activity yet.</p>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {visible.map((entry) => (
              <ActivityItem key={entry.id} entry={entry} selfId={selfId} now={now} />
            ))}
          </ul>
          {rest.length > 0 && (
            <details className="group mt-3">
              <summary className="cursor-pointer text-sm font-medium text-cy-blue-700 hover:underline group-open:mb-3">
                <span className="group-open:hidden">Show {rest.length} more</span>
                <span className="hidden group-open:inline">Show less</span>
              </summary>
              <ul className="flex flex-col gap-3">
                {rest.map((entry) => (
                  <ActivityItem key={entry.id} entry={entry} selfId={selfId} now={now} />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      <p className="mt-3 text-xs text-cy-gray-400">
        {hasMore ? `Showing the latest ${entries.length} events. ` : ""}
        Activity is kept for {ACTIVITY_RETENTION_DAYS} days.
      </p>
    </section>
  );
}
