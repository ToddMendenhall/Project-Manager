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
npm run lint

npm run db:generate       # generate a migration from db/schema.ts changes
npm run db:migrate        # run pending migrations (tsx db/migrate.ts)
npm run db:seed           # seed sample org/admin/portfolio/program/project/task
npm run db:studio         # Drizzle Studio
```

`DATABASE_URL` and `AUTH_SECRET` must be set (see `.env.example`) before any
`db:*` command or the dev server will work — `drizzle.config.ts` and
`db/index.ts` both throw immediately if `DATABASE_URL` is missing.

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

Permission tiers: **Portfolio/Program/Project** mutations require
`requireAdmin`. **Task/ChecklistItem** mutations are open to any org member
(see the comment in `tasks/actions.ts`). **Comment/Attachment** creation is
open to any member, but only the author or an admin can delete one.

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

Client-side `signIn()` calls must pass an explicit `callbackUrl`. Without
one, Auth.js defaults the redirect target to the current page — so a
*successful* sign-in from `/login` returns a URL that still points at
`/login`, which is indistinguishable from a failure if you're checking
`result.url` for `/login`. See `app/login/page.tsx` / `app/register/page.tsx`.

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

### Attachments and comments are polymorphic (task XOR checklist item)

`comments` and `attachments` each have nullable `taskId` and
`checklistItemId` columns plus a DB check constraint
(`(task_id is not null) <> (checklist_item_id is not null)`) enforcing
exactly one parent. `getAttachmentForOrg` branches on which one is set to
walk the right ownership chain. Checklist items reuse this same
infrastructure instead of duplicating comment/attachment tables — if you
add another commentable/attachable entity, extend this pattern rather than
creating parallel tables.

Attachment bytes live directly in Postgres (`bytea`, via the `customType`
in `db/schema.ts`), capped at `MAX_ATTACHMENT_SIZE_BYTES` (4MB,
`lib/attachments.ts`) to stay under Vercel's request body limits — a
deliberate simplification so the app needs no object-storage account; a
later phase can swap this for S3 / Vercel Blob without changing anything
else about the `attachments` table. Uploads go through a route handler
(`app/api/.../attachments/route.ts`) called via client-side `fetch`
(`AttachmentUploadForm`), not a server action — consistent with the
one-native-form-per-page rule above, since the upload form always shares a
page with at least one other form (the comment box, or now the item's own
edit form).

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

Project task views share one `ViewTabs` component
(`components/tasks/view-tabs.tsx`) across List (`tasks/page.tsx`), Board
(`board/page.tsx`, drag-and-drop via native HTML5 DnD, no library), and
Calendar (`calendar/page.tsx`, month-grid math in `lib/calendar.ts`, no
date library).
