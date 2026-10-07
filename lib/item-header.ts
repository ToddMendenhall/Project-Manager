import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import type { ItemHeaderMeta } from "@/components/views/item-header";
import { formatCalendarDate } from "@/lib/dates";

/**
 * The person + date fields in the header of a Portfolio, Program, Project or
 * Task page, the same on every tab (Overview/List/Board/Calendar/Gantt/
 * Reports). Always three fields, in the same order, so headers line up:
 *
 * - Owner (Portfolio/Program), Lead (Project) or Assignee (Task); blank
 *   when nobody is assigned.
 * - Start and Target end / Due: the item's own dates where set. A missing
 *   one is filled from the span of every date beneath it (programs,
 *   projects, tasks, checklist items), and stays blank when nothing below
 *   is dated either.
 *
 * One query per header: the owner's name, the item's own dates, and the
 * min/max of its descendants' dates (each level filtered through its
 * indexed parent column). Callers must already have org-checked the item.
 */

type Level = "portfolio" | "program" | "project" | "task";

const LABELS: Record<Level, { person: string; end: string }> = {
  portfolio: { person: "Owner", end: "Target end" },
  program: { person: "Owner", end: "Target end" },
  project: { person: "Lead", end: "Due" },
  task: { person: "Assignee", end: "Due" },
};

/** Every start/end date beneath the item, as one `d` column. */
function descendantDates(level: Level, id: string): SQL {
  const items = sql`select unnest(array[c.due_date]) as d from checklist_items c`;
  switch (level) {
    case "task":
      return sql`${items} where c.task_id = ${id}`;
    case "project":
      return sql`
        select unnest(array[t.start_date, t.due_date]) as d from tasks t where t.project_id = ${id}
        union all ${items} join tasks t on t.id = c.task_id where t.project_id = ${id}`;
    case "program":
      return sql`
        select unnest(array[pr.start_date, pr.due_date]) as d from projects pr where pr.program_id = ${id}
        union all select unnest(array[t.start_date, t.due_date]) from tasks t
          join projects pr on pr.id = t.project_id where pr.program_id = ${id}
        union all ${items} join tasks t on t.id = c.task_id
          join projects pr on pr.id = t.project_id where pr.program_id = ${id}`;
    case "portfolio":
      return sql`
        select unnest(array[g.start_date, g.target_end_date]) as d from programs g where g.portfolio_id = ${id}
        union all select unnest(array[pr.start_date, pr.due_date]) from projects pr
          join programs g on g.id = pr.program_id where g.portfolio_id = ${id}
        union all select unnest(array[t.start_date, t.due_date]) from tasks t
          join projects pr on pr.id = t.project_id
          join programs g on g.id = pr.program_id where g.portfolio_id = ${id}
        union all ${items} join tasks t on t.id = c.task_id
          join projects pr on pr.id = t.project_id
          join programs g on g.id = pr.program_id where g.portfolio_id = ${id}`;
  }
}

/** The item's own row: who's responsible and its own two dates. */
function ownRow(level: Level, id: string): SQL {
  switch (level) {
    case "portfolio":
      return sql`select u.name as person, x.start_date as own_start, x.target_end_date as own_end
        from portfolios x left join users u on u.id = x.owner_id where x.id = ${id}`;
    case "program":
      return sql`select u.name as person, x.start_date as own_start, x.target_end_date as own_end
        from programs x left join users u on u.id = x.owner_id where x.id = ${id}`;
    case "project":
      return sql`select u.name as person, x.start_date as own_start, x.due_date as own_end
        from projects x left join users u on u.id = x.lead_id where x.id = ${id}`;
    case "task":
      return sql`select u.name as person, x.start_date as own_start, x.due_date as own_end
        from tasks x left join users u on u.id = x.assignee_id where x.id = ${id}`;
  }
}

type HeaderRow = {
  person: string | null;
  own_start: Date | string | null;
  own_end: Date | string | null;
  min_d: Date | string | null;
  max_d: Date | string | null;
};

const formatDate = (value: Date | string | null) => formatCalendarDate(value);

export async function itemHeaderMeta(level: Level, id: string): Promise<ItemHeaderMeta[]> {
  const result = await db.execute<HeaderRow>(sql`
    with own as (${ownRow(level, id)}),
         below as (select min(d) as min_d, max(d) as max_d from (${descendantDates(level, id)}) dates)
    select own.person, own.own_start, own.own_end, below.min_d, below.max_d from own, below`);
  const row = Array.from(result)[0];
  const labels = LABELS[level];
  return [
    { label: labels.person, value: row?.person ?? "" },
    { label: "Start", value: formatDate(row?.own_start ?? row?.min_d ?? null) },
    { label: labels.end, value: formatDate(row?.own_end ?? row?.max_d ?? null) },
  ];
}
