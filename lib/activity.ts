import "server-only";
import { and, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { activityLog, users } from "@/db/schema";
import { dateInputValue } from "@/lib/fields";

/**
 * Activity history (the `activity_log` table) for Program, Project and Task
 * pages. Actions call `logActivity` after a mutation succeeds; pages render
 * `getActivity` through `ActivityFeed`.
 *
 * Only meaningful changes are recorded: created/deleted, renames, status,
 * priority, people and dates (old → new), comments, and whiteboards being
 * linked or unlinked. Reordering, descriptions, custom fields and whiteboard
 * autosaves are not.
 */

export const ACTIVITY_RETENTION_DAYS = 90;
/** Rows a page shows; older ones are still kept until pruned. */
export const ACTIVITY_PAGE_SIZE = 50;
/** Pruning runs on roughly one write in this many, so it costs nothing per event. */
const PRUNE_ONE_IN = 50;

export type ActivityEntityType = (typeof activityLog.entityType.enumValues)[number];
export type ActivityAction = (typeof activityLog.action.enumValues)[number];

/** Which pages' histories an event appears in (a Program's rolls up its projects and tasks). */
export type ActivityScope = {
  orgId: string;
  programId: string;
  projectId?: string | null;
  taskId?: string | null;
};

/** What the event is about. `name` is a snapshot, so the history still reads after a delete. */
export type ActivitySubject = { type: ActivityEntityType; id: string; name: string };

export type ActivityEvent = {
  action: ActivityAction;
  field?: ActivityField;
  oldValue?: string | null;
  newValue?: string | null;
};

/**
 * Records events. Never throws: the mutation has already happened, and a
 * missing history line is better than reporting a failed save that didn't
 * fail. Errors are logged instead.
 */
export async function logActivity(
  actorId: string,
  scope: ActivityScope,
  subject: ActivitySubject,
  events: ActivityEvent[],
) {
  if (events.length === 0) return;
  try {
    await db.insert(activityLog).values(
      events.map((event) => ({
        orgId: scope.orgId,
        programId: scope.programId,
        projectId: scope.projectId ?? null,
        taskId: scope.taskId ?? null,
        entityType: subject.type,
        entityId: subject.id,
        entityName: subject.name.slice(0, 500),
        actorId,
        action: event.action,
        field: event.field ?? null,
        oldValue: event.oldValue ?? null,
        newValue: event.newValue ?? null,
      })),
    );
    if (Math.random() < 1 / PRUNE_ONE_IN) {
      await db
        .delete(activityLog)
        .where(
          and(
            eq(activityLog.orgId, scope.orgId),
            lt(activityLog.createdAt, sql`now() - make_interval(days => ${ACTIVITY_RETENTION_DAYS})`),
          ),
        );
    }
  } catch (err) {
    console.error("Failed to record activity", err);
  }
}

/**
 * Fields whose changes are recorded, keyed by the column they come from.
 * `title` (tasks, checklist items) and `name` both record as "name".
 */
const TRACKED_FIELDS = {
  name: { field: "name", kind: "text" },
  title: { field: "name", kind: "text" },
  status: { field: "status", kind: "text" },
  priority: { field: "priority", kind: "text" },
  assigneeId: { field: "assignee", kind: "user" },
  ownerId: { field: "owner", kind: "user" },
  leadId: { field: "lead", kind: "user" },
  startDate: { field: "startDate", kind: "date" },
  dueDate: { field: "dueDate", kind: "date" },
  targetEndDate: { field: "targetEndDate", kind: "date" },
} as const;

type TrackedColumn = keyof typeof TRACKED_FIELDS;
export type ActivityField = (typeof TRACKED_FIELDS)[TrackedColumn]["field"] | "link";

function stored(kind: "text" | "date" | "user", value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (kind === "date") return dateInputValue(value as Date | string);
  return String(value);
}

/**
 * One `updated` event per tracked column that differs between `before` and
 * `after`. Only columns present in `after` are compared, so callers pass
 * just what they changed. Dates are stored as YYYY-MM-DD and people as
 * names (looked up in one query), so the history reads without joins and
 * survives someone leaving the org.
 */
export async function fieldChanges(
  before: Partial<Record<TrackedColumn, unknown>>,
  after: Partial<Record<TrackedColumn, unknown>>,
): Promise<ActivityEvent[]> {
  const changed = (Object.keys(after) as TrackedColumn[])
    .filter((column) => column in TRACKED_FIELDS)
    .map((column) => {
      const { field, kind } = TRACKED_FIELDS[column];
      return { field, kind, oldValue: stored(kind, before[column]), newValue: stored(kind, after[column]) };
    })
    .filter((c) => c.oldValue !== c.newValue);

  const userIds = [
    ...new Set(changed.flatMap((c) => (c.kind === "user" ? [c.oldValue, c.newValue] : [])).filter((id) => id !== null)),
  ];
  const names = new Map<string, string>();
  if (userIds.length > 0) {
    const rows = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds));
    for (const row of rows) names.set(row.id, row.name);
  }
  const display = (kind: string, value: string | null) =>
    kind === "user" && value !== null ? (names.get(value) ?? "a former member") : value;

  return changed.map((c) => ({
    action: "updated",
    field: c.field,
    oldValue: display(c.kind, c.oldValue),
    newValue: display(c.kind, c.newValue),
  }));
}

/** First line of a comment, trimmed, for the history ("commented: …"). */
export function commentExcerpt(body: string) {
  const firstLine = body.trim().split("\n")[0] ?? "";
  return firstLine.length > 140 ? `${firstLine.slice(0, 139)}…` : firstLine;
}

export type ActivityTarget = { programId: string } | { projectId: string } | { taskId: string };

/**
 * A page's history, newest first, within the retention window. Callers must
 * have org-checked the program/project/task; the org filter is a second
 * guard. Returns one extra row's worth of information as `hasMore`.
 */
export async function getActivity(orgId: string, target: ActivityTarget, limit = ACTIVITY_PAGE_SIZE) {
  const scope =
    "taskId" in target
      ? eq(activityLog.taskId, target.taskId)
      : "projectId" in target
        ? eq(activityLog.projectId, target.projectId)
        : eq(activityLog.programId, target.programId);

  const rows = await db.query.activityLog.findMany({
    where: and(
      eq(activityLog.orgId, orgId),
      scope,
      gt(activityLog.createdAt, sql`now() - make_interval(days => ${ACTIVITY_RETENTION_DAYS})`),
    ),
    columns: {
      id: true,
      entityType: true,
      entityId: true,
      entityName: true,
      action: true,
      field: true,
      oldValue: true,
      newValue: true,
      createdAt: true,
      projectId: true,
      taskId: true,
    },
    with: { actor: { columns: { name: true } } },
    orderBy: [desc(activityLog.createdAt)],
    limit: limit + 1,
  });
  return { entries: rows.slice(0, limit), hasMore: rows.length > limit };
}

export type ActivityEntry = Awaited<ReturnType<typeof getActivity>>["entries"][number];
