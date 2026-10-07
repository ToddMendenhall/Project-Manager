# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A generalized, self-hosted, multi-tenant project management app built around
a **Portfolio → Program → Project → Task → ChecklistItem** hierarchy.
Deliberately free of any industry-specific fields — per-org variation is
handled entirely through the custom fields system (`customFieldDefs` +
`tasks.customFields` jsonb), never by adding columns to the schema.

Stack: Next.js 15 (App Router) + TypeScript, PostgreSQL + Drizzle ORM,
Auth.js v5 (NextAuth, Credentials provider, JWT sessions), Tailwind CSS.
Designed to deploy to Vercel + Neon/Supabase Postgres.

## Commands

```bash
npm install
npm run dev              # dev server
npm run build             # production build (also type-checks)
npm run start             # serve a production build
npx tsc --noEmit          # type-check only, faster than a full build
npm run lint              # ESLint (flat config, eslint.config.mjs); also runs during `next build`

npm run db:generate       # generate a migration from db/schema.ts changes
npm run db:migrate        # run pending migrations (tsx db/migrate.ts)
npm run db:seed           # seed sample org/admin/portfolio/program/project/task
npm run db:studio         # Drizzle Studio
```

On Vercel, `vercel.json`'s `buildCommand` runs `npm run db:migrate` before
`npm run build`, so every deploy applies pending migrations to the database
its `DATABASE_URL` points at. A failed migration fails the deploy, before
any new code goes live. Local `npm run build` deliberately doesn't migrate,
so building never needs a database.

`ALLOW_REGISTRATION=false` (optional, see `.env.example`) turns off public
sign-up at `/register`, so people join only through admin invites. It's read
per request (`lib/registration.ts`; `/login` and `/register` are
`force-dynamic`), so changing it needs a restart/redeploy but no code change.

`DATABASE_URL` and `AUTH_SECRET` must be set (see `.env.example`) before any
`db:*` command or the dev server will work — `drizzle.config.ts` and
`db/index.ts` both throw immediately if `DATABASE_URL` is missing.

Lint uses the ESLint CLI with `eslint-config-next` (`next/core-web-vitals` +
`next/typescript`) rather than the deprecated `next lint`. `next build` lints
too, so a lint error fails a deploy: keep `npm run lint` clean.

There is no automated test suite in this repo. Every feature so far has been
verified with a throwaway Playwright script (headless Chromium, run against
a real local Postgres instance in both `next dev` and `next build && next
start` modes) written and deleted within the same session — never committed.
When adding a feature, follow the same discipline: typecheck → build →
smoke-test against real Postgres in dev and prod → delete the script →
commit.

## Architecture

### Org scoping is the core security boundary

Every entity ultimately belongs to an `organizations` row, and virtually all
authorization in this app reduces to "does this row's ownership chain lead
to the current user's org." `lib/org.ts`'s `requireOrgContext()` is the
server-side guard every page/action calls first; it returns
`{ user, org, role }` (`role` is `"admin" | "member"`, from `orgMembers`).
It's wrapped in React's `cache()`, so the layout, page and nested server
components share one session decode and membership query per request.
`requireAdmin(ctx)` throws if `role !== "admin"`.

`lib/queries.ts` holds the org-scoping query helpers, each one chaining
ownership checks up to `orgId` rather than trusting a bare id from the URL:
`getProgramForOrg` → `getProjectForProgram` (checks the program first) →
`getTaskForProject` (checks the project first) → `getChecklistItemForTask`
(checks the task first). `getAttachmentForOrg` walks up from whichever
parent is set (task or checklist item — see below) to `orgId`. When adding
a new nested entity, add a matching helper here rather than querying the
table directly in a page/action — this is what prevents cross-org access
through a guessed id.

The same applies to user references: an owner/lead/assignee id from a form
or inline editor goes through `resolveOrgMemberId(userId, orgId)`, which
rejects anyone who isn't a member of the org (a valid UUID alone proves
nothing). Optional date strings go through `toDateOrNull` (`lib/dates.ts`),
which throws a clear error for a malformed date instead of letting an
Invalid Date reach the driver.

**Keep the dashboard layout cheap.** `Sidebar` renders on every dashboard
page, so it loads only names plus aggregate counts
(`getProjectTaskCounts`, `countOpenTasksForAssignee`), never task rows.
Likewise, relational loads of a user (`owner`, `lead`, `assignee`) select
`{ columns: { id: true, name: true } }`, not the full row (which carries
the password hash). Per-user lists (`getAssignedTasks`) filter in SQL
rather than loading the org and filtering in JS.

The sidebar is user-resizable (`ResizableSidebar`): drag its right edge,
double-click the edge to fit the widest truncated label, or focus it and use
←/→/Home. The width is clamped (`lib/sidebar.ts`) and saved in the
`sidebar-width` cookie, which `Sidebar` reads server-side so pages render at
that width with no jump. Truncated labels inside flex rows need `min-w-0`
(flex items default to `min-width: auto`, so `truncate` alone overflows
instead of showing an ellipsis), and carry a `title` with the full name.

Permission tiers: **Portfolio/Program/Project/Task/ChecklistItem**
create/edit/delete is open to any org member — those actions only call
`requireOrgContext()` plus the org-scoping helpers, never `requireAdmin`.
**Comment/Attachment** creation is open to any member, but only the author
or an admin can delete one. `requireAdmin` is reserved for org
administration: member/invite management (`members/actions.ts`) and the
org-wide attachments page.

### Split Auth.js config (edge vs Node runtime)

`middleware.ts` runs on Vercel's Edge Runtime, which can't load the
`postgres` driver or `bcryptjs`. So the config is split:
- `lib/auth.config.ts` — edge-safe (`trustHost: true`, the `authorized`
  callback that gates `/dashboard` and `/onboarding`, no providers). Used
  directly by `middleware.ts`.
- `lib/auth.ts` — full config (`...authConfig`, the Credentials provider,
  DB/bcrypt access). Used by pages, server actions, and route handlers.

`trustHost: true` must live in `authConfig` itself, not be added only in
`lib/auth.ts` — middleware builds its own `NextAuth()` instance straight
from `authConfig`, and without it there Auth.js rejects Vercel's deployment
Host header (`UntrustedHost`), breaking every session check.

**Unauthenticated endpoints are rate limited** (`lib/rate-limit.ts`): fixed
windows counted in the `auth_rate_limits` table, since serverless functions
share no memory. Keys are SHA-256 hashes of the rule plus email/IP, so the
table never stores who tried. Sign-in (`authorize()` in `lib/auth.ts`)
blocks after 10 failures per account or 30 per IP in 15 minutes, before
checking the password, and throws `RateLimitedSignin` (code
`"rate_limited"`), which the login page turns into a specific message. A
successful sign-in clears the account's counter. Registration allows 5
attempts per IP per hour. The limiter fails open: if its own query errors,
the attempt is allowed and logged. An unknown email still runs a bcrypt
compare against a dummy hash, so timing doesn't reveal which emails exist.
Routine rejected sign-ins are filtered out of Auth.js's error log; throttling
logs a warning. `clientIp()` trusts `x-real-ip`/`x-forwarded-for`, which
Vercel sets from the real connection. Behind another proxy, make sure it
overwrites those headers.

Client-side `signIn()` calls must pass an explicit `callbackUrl`. Without
one, Auth.js defaults the redirect target to the current page — so a
*successful* sign-in from `/login` returns a URL that still points at
`/login`, which is indistinguishable from a failure if you're checking
`result.url` for `/login`. See `components/auth/login-form.tsx` /
`components/auth/register-form.tsx` (the `app/login` and `app/register` pages
are thin server wrappers that pass in the registration flag).

### Server actions: one native form per page

Mutations are Next.js Server Actions, one `actions.ts` per route segment
(`"use server"`), invoked either as a form's `action` prop or, for
mutations that need to coexist with another form on the same page, as a
plain function call. **Never render two native `<form action={serverAction}>`
elements in the same page tree** — a real Next.js/React bug corrupts one
form's FormData when a second native form action exists anywhere in the
same tree (not just nested forms — any two on the page). This is why:
- `ConfirmDeleteButton` calls its action via `onClick` + `useTransition`,
  never a form.
- `AttachmentUploadForm` posts to a route handler via client-side `fetch`,
  not a form action.
- `CommentSection`'s add-comment form and `ChecklistWidget`'s quick-add
  submit via a manual `onSubmit` handler (`FormData` built by hand, action
  called directly, `router.refresh()` after) rather than `action={...}`,
  specifically because the checklist item detail page already has one
  native form (the item's own inline edit form).
- Sign-out is a client-side `signOut()` call (`SignOutButton`), never a
  form action, since the dashboard layout wraps every page.

When adding a new mutation to a page that already has a form, default to
the function-call pattern rather than a second `<form action>`.

A mutating action that lets the user land on the page for the entity it
just deleted (e.g. deleting a checklist item from its own detail page, or a
task from its own detail page) ends with `redirect()` back to the parent
list/detail — deletes triggered from a list page redirect to that same
list, which is a no-op navigation, so the same action works from both call
sites.

### Attachments and comments are polymorphic (task, checklist item or whiteboard)

`comments` and `attachments` each have nullable `taskId`,
`checklistItemId` and `whiteboardId` columns plus a DB check constraint
(`num_nonnulls(task_id, checklist_item_id, whiteboard_id) = 1`) enforcing
exactly one parent. A whiteboard parent means images placed on its canvas
(attachments) or board-level discussion (comments).
`getAttachmentForOrg` branches on which one is set to walk the right
ownership chain, and `getOrgAttachmentsDetailed` returns a union row type
(`itemKind: "whiteboard"` rows have no program/project) for the admin
Attachments page. Checklist items reuse this same
infrastructure instead of duplicating comment/attachment tables — if you
add another commentable/attachable entity, extend this pattern rather than
creating parallel tables.

Attachment bytes live directly in Postgres (`bytea`, via the `customType`
in `db/schema.ts`), capped at `MAX_ATTACHMENT_SIZE_BYTES` (4MB,
`lib/attachments.ts`) to stay under Vercel's request body limits — a
deliberate simplification so the app needs no object-storage account; a
later phase can swap this for S3 / Vercel Blob without changing anything
else about the `attachments` table. Attachment rows are never updated
after upload, so `/api/attachments/[id]` serves them with
`Cache-Control: private, max-age=31536000, immutable`. Keep it that way:
if an attachment's bytes could ever change, that header must change too. Uploads go through a route handler
(`app/api/.../attachments/route.ts`) called via client-side `fetch`
(`AttachmentUploadForm`), not a server action — consistent with the
one-native-form-per-page rule above, since the upload form always shares a
page with at least one other form (the comment box, or now the item's own
edit form).

### Activity history

Program, Project and Task pages end with an **Activity** section
(`ActivityFeed`, `components/activity/activity-feed.tsx`) built from the
`activity_log` table. A Project's history rolls up its tasks and checklist
items, and a Program's rolls up its projects too.

- **Writing:** actions call `logActivity(actorId, scope, subject, events)`
  (`lib/activity.ts`) after the mutation succeeds. Each level's
  `actions.ts` wraps it in a small `log<Kind>Activity` helper that fills in
  the scope. `logActivity` never throws: a failed history write is logged,
  not reported as a failed save.
- **What's recorded:** created/deleted, renames, status, priority, people
  (assignee/owner/lead) and dates as old → new, comments (first line), and
  whiteboards created/deleted/linked/unlinked on a project or program.
  `fieldChanges(before, after)` produces one `updated` event per tracked
  column that actually changed, so board reorders and no-op saves record
  nothing. Descriptions, custom fields, attachments and whiteboard
  autosaves aren't recorded. Program deletion isn't either, since the
  program's history is deleted with it.
- **Rows outlive their subject:** `entityName` and old/new values are
  display snapshots (people as names, dates as YYYY-MM-DD), so "deleted
  task X" still reads. `projectId`/`taskId` are scope columns with no
  foreign key, for the same reason. Only `programId` cascades.
- **Retention:** `ACTIVITY_RETENTION_DAYS` (90). Reads filter to the window,
  and roughly one write in 50 prunes the org's older rows. There is no cron
  job.
- **Display:** the section is a native `<details>`, collapsed by default,
  with the event count in its heading. When opened it shows up to the
  latest 50 events, the first 10 visible and the rest behind a nested
  "Show N more" `<details>`. The two use named Tailwind groups
  (`group/activity`, `group/more`) so each toggle only styles itself.
- **Links:** names of projects, tasks, checklist items and whiteboards in
  the feed link to them while they still exist. `getActivity` looks up each
  entity type's current parents in one org-scoped query (`currentHrefs`), so
  a deleted item, or an id from another org, renders as plain text. The
  page's own item is never linked ("this task"), and a rename links only
  the new name.
- When adding a new tracked field or entity, extend `TRACKED_FIELDS` /
  the `activity_entity` enum and `ActivityFeed`'s labels rather than
  writing rows by hand.

### Calendar dates and time zones

Start/due/target-end dates are calendar days stored as **midnight UTC** of
that day (`toDateOrNull("2026-09-15")`). Never read them with local getters
or a bare `toLocaleDateString()`: west of UTC, midnight UTC is still the
previous day locally, so dates show a day early. In the Gantt this used to
save shifted dates on every drag. Use the helpers in `lib/dates.ts`:

- `formatCalendarDate(value)` for display ("9/15/2026", fixed en-US + UTC,
  so the server render and every browser agree), and `calendarDateKey`
  for "YYYY-MM-DD" comparisons.
- For day arithmetic in the browser (the Gantt grid), use
  `toLocalCalendarDate` to get a local-midnight Date of the same day. Convert
  back with `localDateKey` before saving, never `toISOString()` (east of UTC,
  that's the previous day).
- "Today" is the viewer's day (`todayKey()` in the browser). Anything that
  depends on it in a Client Component is computed after mount (Gantt's
  `useToday`, the task List's overdue marks): the server runs in UTC, and a
  different day in the server render breaks hydration. Server-only code
  (Reports) uses the server's day.

### Custom fields keep the schema industry-agnostic

`customFieldDefs` (program-scoped, `entityType` currently only `"task"` is
used in the UI) defines per-org fields; values live in `tasks.customFields`
jsonb keyed by the field's `key`. `lib/custom-fields.ts` has the
type-coercing parse (`parseCustomFieldValues`, reads `cf_<key>` form
fields) and options helpers. Never add a domain-specific column to `tasks`
or any other core table — route it through this system instead.

### Postgres connection

All three `postgres()` client instantiations (`db/index.ts`, `db/migrate.ts`,
`db/seed.ts`) pass `prepare: false`. This is required for connection
poolers (Neon's `-pooler` endpoint, PgBouncer in transaction mode, etc.)
that don't support prepared statements reused across queries — omitting it
works fine against a direct/unpooled connection but breaks silently (or
with cryptic errors) against a pooled one.

`db/index.ts` also caches its client on `globalThis` outside production:
`next dev` evaluates the module once per compiled route (and on every hot
reload), and without the cache each evaluation opens its own pool until
Postgres refuses connections ("too many clients already"). It sets
`idle_timeout: 20` so idle connections close instead of lingering.

### Route structure

Routes nest to match the data hierarchy under
`app/dashboard/programs/[programId]/projects/[projectId]/tasks/[taskId]/...`,
with `checklist/[itemId]` one level deeper. Each level's CRUD follows the
same shape: a list `page.tsx`, `new/page.tsx`, `[id]/page.tsx` (detail),
`[id]/edit/page.tsx` (Program/Project/Portfolio only — Task and
ChecklistItem edit their fields inline on the detail page itself, see the
form-action note above), and a sibling `actions.ts`. `lib/fields.ts` holds
the shared `STATUS_OPTIONS`/`PRIORITY_OPTIONS` enums-as-arrays used by every
form and badge component (`components/status-badge.tsx`).

### Multi-view tabs (List/Board/Calendar/Gantt) at every hierarchy level

Every level whose children are worth browsing on their own — the org-wide
Portfolios index, a Portfolio's Programs, a Program's Projects, a Project's
Tasks — gets the same `ViewTabs` (`components/views/view-tabs.tsx`) row
switching between List, Board, Calendar, and Gantt, so switching views never
requires detouring through a "View all" link first. The four generic view
components live in `components/views/` and are shape-agnostic (typed by the
page, not the component):
- `BoardView` — columns from the shared `STATUS_OPTIONS` (every level's
  `status` column reuses the one `statusEnum`, which is what makes one
  generic board work for Portfolios, Programs, Projects, and Tasks alike).
  **Cards must be pre-rendered server-side JSX passed as each item's `card`
  field, not a `renderCard` render-prop** — a Server Component page can pass
  rendered `ReactNode` into a Client Component's props, but not an arbitrary
  closure (Next.js RSC rule; passing a render-prop function throws at
  runtime, not at typecheck). For the same reason `onStatusChange` must be
  the actual `"use server"` action (optionally `.bind()`-ed to pin leading
  args), never a wrapper arrow function — only a bound/unbound Server Action
  reference survives serialization across the boundary.
- `CalendarView` / `CalendarNav` — reuses `lib/calendar.ts`'s month-grid math.
- `GanttView` (`components/views/gantt-view.tsx`) — a Client Component
  rendering a collapsible tree of `GanttNode`s (`lib/gantt-types.ts`, built
  server-side by `lib/gantt-tree.ts`), so one Portfolio's Gantt can expand
  down through Programs, Projects, Tasks, and Checklist Items. Draws a bar
  when both `startDate` and `endDate` are present, a single dot when only
  one is set, and hides a row (with a caption) when neither it nor any
  descendant has a date. Every row with visible children gets a read-only
  **summary bar** (`SummaryBar` / `descendantSpan` in
  `gantt-timeline.tsx`) spanning the earliest to latest date anywhere
  beneath it, whether or not the row has dates of its own. An undated row
  shows it centered. A row that also has its own bar or dot shows the
  summary tucked at the top (`placement="top"`) and its own bar lowered
  (`SUMMARY_STACKED_Y`), so the two never overlap. It's computed from the view's live dates, so it follows a
  child being dragged, and the spans feed the timeline's range so a
  collapsed row's bar always fits. `ResourceGanttView` follows the same
  rule (member rows, and tasks with checklist items). A Program's and a Project's own Gantt tab also pass
  `summary={{ title, href }}`, which pins a row for that program/project
  above its children. Its summary bar always spans every date beneath it,
  regardless of its own planned dates, and its label is just the name. The
  dates live in the page header (see "Item headers" below). This is why `tasks` has a `startDate` column even
  though only `dueDate` used to exist — a Gantt bar needs a range, and
  every other leaf-ish level (Portfolio/Program's `targetEndDate`,
  Project's `dueDate`) already had a paired start date.
  Bars are drag-to-reschedule: drag either end of a bar, or drag a dot to
  set its missing date. The page passes one `on<Kind>DateChange` prop per
  level, each the real `"use server"` action (`updatePortfolioDates`,
  `updateProgramDates`, `updateProjectDates`, `updateTaskDates`), per the
  serialization rule above. Checklist Items have no handler and stay
  read-only, since they only have a due date. Dates update optimistically
  while dragging, are saved on pointerup, and revert if the action throws.
  Compute the dragged dates in the pointermove handler and save from
  pointerup directly — starting the save transition from inside a
  `setDates` updater errors in dev, because updaters run during render.
- `ResourceGanttView` (`components/views/resource-gantt-view.tsx`, the
  Resources page) — the same timeline rooted at org members, built by
  `lib/resource-gantt.ts`. It's read-only, with no drag-to-reschedule.
- Zoom (Days/Weeks/Months/Quarters, plus Ctrl/⌘ + wheel) lives in
  `components/views/gantt-timeline.tsx`, shared by `GanttView` and
  `ResourceGanttView`: each level is just a px-per-day width plus its own
  header rows, so bar/dot/drag math stays in days and only multiplies by
  the current `dayWidth`. The chosen level persists in `localStorage`, and
  the date at the viewport's center is kept centered across zoom changes.

### Item headers

Every Portfolio, Program and Project page, on every tab (Overview/List,
Board, Calendar, Gantt, Reports), and the Task page show the same three
header fields from `itemHeaderMeta(level, id)` (`lib/item-header.ts`):
Owner (Portfolio/Program), Lead (Project) or Assignee (Task); Start; and
Target end (Portfolio/Program) or Due (Project/Task).

- Dates are the item's own where set. A missing one is filled from the
  min/max of every date beneath it (programs, projects, tasks, checklist
  items), computed in one SQL query per header rather than by loading the
  tree.
- A field with nothing to show stays, with a blank value, so headers line
  up across items. `ItemHeader` renders a non-breaking space for it.
- Don't build header meta by hand in a page. Call the helper, so every tab
  stays consistent.

### Whiteboards

Org-wide canvases for process maps and brainstorming, reached from the
secondary header (`/dashboard/whiteboards`). `whiteboards/layout.tsx` puts
the board list panel (`WhiteboardListPanel`) beside every whiteboard page
and undoes `main`'s padding so the canvas runs edge to edge.

- **Storage:** the whole board is one `whiteboards.data` jsonb document
  (`{ nodes, edges }`), not a row per element. Its shape lives in
  `lib/whiteboard.ts`: `whiteboardDocSchema` validates every save (a
  connector must point at real nodes, and there are size caps). Only
  content is saved. Selection, viewport and which item is being edited
  are per-viewer state and are never persisted.
- **Editor:** `components/whiteboards/editor/` is built on React Flow
  (`@xyflow/react`):
  - Custom `sticky`/`shape`/`text`/`frame`/`drawing`/`image` node types and
    a `connector` edge. Each node kind's data lives in one optional-field
    `whiteboardNodeDataSchema`, and `whiteboardNodeSchema` enforces which
    fields a kind requires.
  - **Frames** (sections, swimlanes) render beneath everything. Stored
    `zIndex` stays layer-relative, and `FRAME_LAYER_OFFSET` is applied only
    to the nodes passed to React Flow. Dragging a frame carries every
    unselected node fully inside its box at drag start (`onNodeDragStart` /
    `onNodeDrag`). This uses containment at drag time, not React Flow
    `parentId`, so nothing about membership is stored.
  - **Pen/highlighter** strokes are captured by `PenOverlay` (a layer that
    also re-implements wheel pan/zoom while active). Each stroke becomes a
    `drawing` node whose `points` are relative to its own box.
  - **Images** are uploaded through
    `app/api/whiteboards/[whiteboardId]/images` (via file picker, drop or
    paste) as attachments parented by the board. The route sniffs magic
    bytes and only accepts PNG/JPEG/GIF/WebP, never SVG. Image nodes
    reference the attachment id and render through the org-scoped
    `/api/attachments/[id]` route. Before upload, `media.ts` downscales
    images to at most 2000px and re-encodes them as WebP when that's smaller
    (GIFs pass through so animation survives), since image bytes count
    against the database's storage and transfer quotas. Saves deliberately
    don't verify image
    ids, so a board whose image an admin deleted still saves and shows a
    placeholder. `duplicateWhiteboard` copies the image rows and remaps the
    copy's nodes.
  - Alignment guides snap a single dragged node to other nodes'
    edges/centers (`handleNodesChange` + `geometry.ts`). Multi-selection
    gets align/distribute.
  - Handles run in `ConnectionMode.Loose`, so any side connects to any side.
  - Per-viewer editing state reaches nodes through `EditorContext`, never
    node `data`.
  - Undo history is serialized-doc snapshots. Mid-drag and mid-resize
    states are skipped, so one gesture is one undo step.
- **Autosave:** saves are debounced and use optimistic concurrency.
  - `saveWhiteboard(id, doc, expectedVersion)` only updates if `version`
    still matches. Otherwise it returns a conflict, and the editor offers
    "Load their version" or "Overwrite with mine".
  - Open editors also poll `getWhiteboardVersion` to notice others' saves:
    every 15s while someone is interacting, every 2 min after 3 idle
    minutes, never while the tab is hidden, and once immediately on return.
    Each check is a function invocation plus a query, and a fast poll on an
    untouched board would keep a scale-to-zero database (Neon) awake
    indefinitely, so keep it backed off.
  - There is no real-time co-editing or live cursors. Vercel serverless
    can't hold websockets, so that would need an external service.
  - The history/save baseline is computed with the same `serialize()` as
    every later snapshot. Comparing against the raw loaded doc would make
    key-order differences register as an edit and autosave on open.
  - `saveWhiteboard` deliberately doesn't `revalidatePath`. In a server
    action, revalidating makes the response carry a fresh render of the
    current page, which re-reads the whole board, list panel, link targets
    and comments on every autosave. Instead the editor fires
    `WHITEBOARD_SAVED_EVENT` (`lib/whiteboard.ts`) after each save, and
    `WhiteboardListPanel` shows that board as "just now · <you>" at the top.
    Moving between boards doesn't refetch the layout, so the panel keeps
    those local times until the layout's data changes (e.g. a rename
    revalidates it). Other people's edits appear on the next full load.
- **Permissions:** any member can create, edit or duplicate a board. Only
  the creator or an admin can delete one (`canDeleteWhiteboard`), the same
  rule as comments and attachments.
- **Comments:** board-level discussion in a side panel
  (`components/whiteboards/comments-panel.tsx`), toggled from the header's
  "Comments (n)" button. Rows are ordinary `comments` with `whiteboardId` set,
  so they cascade with the board, and the author-or-admin delete rule matches
  task comments.
  - The editor owns the list. `createWhiteboardComment` /
    `deleteWhiteboardComment` / `listWhiteboardComments` return the fresh list
    instead of revalidating or calling `router.refresh()`, which would
    re-render the page and re-read the whole canvas.
  - The panel re-reads the list each time it opens, to pick up others'
    comments. It never polls.
  - Whether the panel is open persists per viewer in `localStorage`.
  - The editor is a grid: the header spans both columns, and the canvas and
    panel share the row beneath it.
  - Index cards show `commentCount` (an indexed count subquery in
    `getOrgWhiteboards`).
- **Export and thumbnails:** `media.ts`'s `renderBoard` snapshots React
  Flow's viewport with `html-to-image`, which is pinned to 1.11.11 (the
  version React Flow's own export example uses; later versions regress).
  - Export downloads the whole board as PNG/SVG.
  - After saves (throttled), the editor renders a small PNG and POSTs it to
    `app/api/whiteboards/[whiteboardId]/thumbnail`, which only accepts a
    real PNG.
  - Cards load it as `?v=<thumbnailUpdatedAt>` with immutable caching.
    Boards with no thumbnail yet fall back to a block preview drawn from
    their data.
- **Templates:** `lib/whiteboard-templates.ts` builds plain docs. A
  templated board is an ordinary board, and nothing records which template
  it came from. "New whiteboard" (`NewWhiteboardButton`) opens the picker,
  and `createWhiteboard(templateKey)` validates the key.
- **Scoping:** `getWhiteboardForOrg` / `getOrgWhiteboards` only load `data`
  when passed `{ withData: true }`. `getOrgWhiteboards` gets `itemCount`
  from SQL, so the list page never loads canvases.
- **Project/Program link:** a board can link to one Project *or* one Program
  (`whiteboards.projectId` / `programId`, nullable, with a check that at
  most one is set; deleting the project/program sets it null). It's context
  only: nothing on the canvas references tasks.
  - `WhiteboardLinkPicker` in the board header changes it, and
    `setWhiteboardLink` validates the target belongs to the org. The picker
    sends whatever was selected and relies on that server check.
  - `LinkedWhiteboards` lists linked boards on the Project page, and on the
    Program page together with its projects' boards. Its "New whiteboard"
    creates a board already linked there (`createWhiteboard(key, link)`).
  - Actions that change a board's name, link or existence revalidate those
    pages (`linkedPagePaths`). A project link also refreshes its program's page.
  - `lib/whiteboard-links.ts` holds the client-safe link types and the
    `whiteboardLinkInfo` display helper.

Portfolio/Program don't have a distinct "Overview" tab the way Project does
(the tab set there is `["list", "board", "calendar", "gantt"]`, with `list`
pointing at the detail page itself, `hrefs={{ list: basePath }}`) — their
detail page already shows the full children list inline with no separate
paginated List route, so Overview and List would otherwise be the same
page under two tab labels. Project keeps `overview` in its tab set because
its detail page shows a preview (5 tasks) distinct from the full,
filterable List page — see `hrefs={{ list: `${basePath}/tasks` }}` on its
`ViewTabs` usage, which is the one place the List tab's default
`${basePath}/list` href is overridden (the route is named `tasks/`, not
`list/`, since it predates this pattern).
