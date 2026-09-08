# Project Manager

A generalized, cloud-based project management system built around a
**Program → Project → Task** hierarchy. Not tied to any specific industry —
domain-specific attributes are added per-organization via custom fields, not
hardcoded into the schema.

This is phase 1: data model, migrations, seed data, and authentication with
organization scoping. Program/Project/Task CRUD screens, additional views
(board/calendar), and collaboration features come in later phases.

## Stack

- Next.js (App Router) + TypeScript
- PostgreSQL + Drizzle ORM
- Auth.js (NextAuth v5) with credentials auth
- Tailwind CSS

## Data model

- **Organization** — tenant boundary
- **User** / **OrgMember** — users belong to organizations with a role (`admin` | `member`)
- **Program** — long-lived initiative, belongs to an organization
- **Project** — bounded engagement, belongs to a program
- **Task** — unit of work, belongs to a project, can have subtasks (`parentTaskId`)
- **CustomFieldDef** — per-program field definitions (text/number/date/boolean/select)
- Task-level custom values live in `tasks.customFields` (jsonb), keyed by the field's `key`
- **Comment**, **Attachment** — attached to tasks
- **ActivityLog** — append-only audit trail per org

See `db/schema.ts` for the full definition.

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and set `DATABASE_URL` to a Postgres
   connection string (Neon, Supabase, or local Postgres all work) and
   `AUTH_SECRET` (generate with `npx auth secret`).

3. Generate and run migrations:

   ```bash
   npm run db:generate
   npm run db:migrate
   ```

4. (Optional) Seed sample data — creates a sample organization, admin user
   (`admin@example.com` / `password123`), program, project, and task:

   ```bash
   npm run db:seed
   ```

5. Run the dev server:

   ```bash
   npm run dev
   ```

6. Visit `http://localhost:3000` — you'll be redirected to `/login`. Either
   sign in with the seeded admin account or go to `/register` to create a new
   organization.

## Auth & org scoping

- Sign-up (`/register`) creates a new organization and its first user as
  `admin` in one transaction.
- A user's organization membership determines what they can see — every
  data query in the dashboard is scoped by `orgId`. Multi-org switching
  isn't implemented yet; a user's first membership is treated as their
  active organization.
- `middleware.ts` protects `/dashboard/*` and `/onboarding`, redirecting
  unauthenticated requests to `/login`.
- `lib/org.ts` exports `requireOrgContext()`, the server-side guard used by
  protected pages/route handlers to get `{ user, org, role }`.

## Deploying

Designed to deploy to Vercel with a Neon or Supabase Postgres database. Set
`DATABASE_URL`, `AUTH_SECRET`, and `AUTH_URL` (your production URL) as
environment variables, then run `npm run db:migrate` against the production
database before first deploy.
