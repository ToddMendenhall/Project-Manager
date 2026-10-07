import "server-only";
import { and, asc, count, desc, eq, ilike, inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  attachments,
  checklistItems,
  comments,
  customFieldDefs,
  invites,
  orgMembers,
  organizations,
  portfolios,
  programs,
  projects,
  tasks,
  users,
  whiteboards,
} from "@/db/schema";

export type SearchResult = { id: string; title: string; path: string; href: string };
export type SearchResults = {
  tasks: SearchResult[];
  projects: SearchResult[];
  programs: SearchResult[];
  members: SearchResult[];
};

const SEARCH_GROUP_LIMIT = 8;

/** Powers the global command bar (⌘K) — matches by name/title within the org, grouped by kind. */
export async function searchOrg(orgId: string, query: string): Promise<SearchResults> {
  const pattern = `%${query}%`;

  const [taskRows, projectRows, programRows, memberRows] = await Promise.all([
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        programId: programs.id,
        programName: programs.name,
        projectId: projects.id,
        projectName: projects.name,
      })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .innerJoin(programs, eq(projects.programId, programs.id))
      .where(and(eq(programs.orgId, orgId), ilike(tasks.title, pattern)))
      .limit(SEARCH_GROUP_LIMIT),
    db
      .select({
        id: projects.id,
        name: projects.name,
        programId: programs.id,
        programName: programs.name,
      })
      .from(projects)
      .innerJoin(programs, eq(projects.programId, programs.id))
      .where(and(eq(programs.orgId, orgId), ilike(projects.name, pattern)))
      .limit(SEARCH_GROUP_LIMIT),
    db
      .select({ id: programs.id, name: programs.name })
      .from(programs)
      .where(and(eq(programs.orgId, orgId), ilike(programs.name, pattern)))
      .limit(SEARCH_GROUP_LIMIT),
    db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(orgMembers)
      .innerJoin(users, eq(orgMembers.userId, users.id))
      .where(and(eq(orgMembers.orgId, orgId), ilike(users.name, pattern)))
      .limit(SEARCH_GROUP_LIMIT),
  ]);

  return {
    tasks: taskRows.map((t) => ({
      id: t.id,
      title: t.title,
      path: `${t.programName} / ${t.projectName}`,
      href: `/dashboard/programs/${t.programId}/projects/${t.projectId}/tasks/${t.id}`,
    })),
    projects: projectRows.map((p) => ({
      id: p.id,
      title: p.name,
      path: p.programName,
      href: `/dashboard/programs/${p.programId}/projects/${p.id}`,
    })),
    programs: programRows.map((p) => ({
      id: p.id,
      title: p.name,
      path: "Program",
      href: `/dashboard/programs/${p.id}`,
    })),
    members: memberRows.map((m) => ({
      id: m.id,
      title: m.name,
      path: m.email,
      href: `/dashboard/members`,
    })),
  };
}

/** Org members available to assign as a program owner / project lead. */
export async function getOrgMembers(orgId: string) {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
    })
    .from(orgMembers)
    .innerJoin(users, eq(orgMembers.userId, users.id))
    .where(eq(orgMembers.orgId, orgId))
    .orderBy(users.name);
}

/**
 * Outstanding (unaccepted) invites for an org, expired or not — used by the
 * admin Members page. Expired invites still need to show up here: they
 * can't be accepted anymore, but an admin still needs to see and revoke one
 * before re-inviting the same email (createInvite blocks a second invite
 * to an address that already has an unaccepted one, expired or not).
 */
export async function getPendingInvitesForOrg(orgId: string) {
  return db
    .select({
      id: invites.id,
      email: invites.email,
      role: invites.role,
      token: invites.token,
      expiresAt: invites.expiresAt,
      createdAt: invites.createdAt,
    })
    .from(invites)
    .where(and(eq(invites.orgId, orgId), isNull(invites.acceptedAt)))
    .orderBy(desc(invites.createdAt));
}

/** Fetches an invite by its link token, with the org name for display on the public accept page. */
export async function getInviteByToken(token: string) {
  const [row] = await db
    .select({
      id: invites.id,
      orgId: invites.orgId,
      orgName: organizations.name,
      email: invites.email,
      role: invites.role,
      expiresAt: invites.expiresAt,
      acceptedAt: invites.acceptedAt,
    })
    .from(invites)
    .innerJoin(organizations, eq(invites.orgId, organizations.id))
    .where(eq(invites.token, token))
    .limit(1);

  return row ?? null;
}

/** Org members with account details (role, joined date) — used by the admin Members page. */
export async function getOrgMembersDetailed(orgId: string) {
  return db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      role: orgMembers.role,
      createdAt: orgMembers.createdAt,
    })
    .from(orgMembers)
    .innerJoin(users, eq(orgMembers.userId, users.id))
    .where(eq(orgMembers.orgId, orgId))
    .orderBy(users.name);
}

/** Org's portfolios, for a program's portfolio picker. */
export async function getOrgPortfolios(orgId: string) {
  return db.select().from(portfolios).where(eq(portfolios.orgId, orgId)).orderBy(portfolios.name);
}

/** Fetches a portfolio only if it belongs to the given org — prevents cross-org access. */
export async function getPortfolioForOrg(portfolioId: string, orgId: string) {
  const [portfolio] = await db
    .select()
    .from(portfolios)
    .where(and(eq(portfolios.id, portfolioId), eq(portfolios.orgId, orgId)))
    .limit(1);

  return portfolio ?? null;
}

/**
 * Validates a submitted user id (owner, lead, assignee) against the org's
 * membership rather than trusting the form value: an id that's merely a
 * well-formed UUID could be anyone's, including another org's user.
 * Empty means "unassigned".
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveOrgMemberId(userId: string | null | undefined, orgId: string): Promise<string | null> {
  if (!userId) return null;
  if (!UUID_PATTERN.test(userId)) {
    throw new Error("That person isn't a member of this organization");
  }
  const [member] = await db
    .select({ userId: orgMembers.userId })
    .from(orgMembers)
    .where(and(eq(orgMembers.userId, userId), eq(orgMembers.orgId, orgId)))
    .limit(1);
  if (!member) {
    throw new Error("That person isn't a member of this organization");
  }
  return member.userId;
}

/** Fetches a program only if it belongs to the given org — prevents cross-org access. */
export async function getProgramForOrg(programId: string, orgId: string) {
  const [program] = await db
    .select()
    .from(programs)
    .where(and(eq(programs.id, programId), eq(programs.orgId, orgId)))
    .limit(1);

  return program ?? null;
}

/** Fetches a project only if it belongs to the given program (which must itself belong to the org). */
export async function getProjectForProgram(projectId: string, programId: string, orgId: string) {
  const program = await getProgramForOrg(programId, orgId);
  if (!program) return null;

  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.programId, programId)))
    .limit(1);

  return project ?? null;
}

/**
 * Fetches a project by id alone, scoped to the org via its program — used
 * where the caller (e.g. the Gantt view's hierarchical drag handlers) only
 * has the project id on hand, not its parent program id.
 */
export async function getProjectForOrg(projectId: string, orgId: string) {
  const [row] = await db
    .select({ project: projects, portfolioId: programs.portfolioId })
    .from(projects)
    .innerJoin(programs, eq(projects.programId, programs.id))
    .where(and(eq(projects.id, projectId), eq(programs.orgId, orgId)))
    .limit(1);

  return row ? { ...row.project, portfolioId: row.portfolioId } : null;
}

/**
 * Fetches a task by id alone, scoped to the org via its project/program —
 * used where the caller only has the task id on hand (see getProjectForOrg).
 */
export async function getTaskForOrg(taskId: string, orgId: string) {
  const [row] = await db
    .select({ task: tasks, programId: programs.id, portfolioId: programs.portfolioId })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .innerJoin(programs, eq(projects.programId, programs.id))
    .where(and(eq(tasks.id, taskId), eq(programs.orgId, orgId)))
    .limit(1);

  return row ? { ...row.task, programId: row.programId, portfolioId: row.portfolioId } : null;
}

/** Fetches a task only if it belongs to the given project (which must itself belong to the program/org). */
export async function getTaskForProject(taskId: string, projectId: string, programId: string, orgId: string) {
  const project = await getProjectForProgram(projectId, programId, orgId);
  if (!project) return null;

  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.projectId, projectId)))
    .limit(1);

  return task ?? null;
}

/** Fetches a checklist item only if it belongs to the given task (which must itself belong to the project/program/org). */
export async function getChecklistItemForTask(
  itemId: string,
  taskId: string,
  projectId: string,
  programId: string,
  orgId: string,
) {
  const task = await getTaskForProject(taskId, projectId, programId, orgId);
  if (!task) return null;

  const [item] = await db
    .select()
    .from(checklistItems)
    .where(and(eq(checklistItems.id, itemId), eq(checklistItems.taskId, taskId)))
    .limit(1);

  return item ?? null;
}

/** Task-level custom field definitions for a program, in display order. */
export async function getTaskCustomFieldDefs(programId: string) {
  return db
    .select()
    .from(customFieldDefs)
    .where(and(eq(customFieldDefs.programId, programId), eq(customFieldDefs.entityType, "task")))
    .orderBy(customFieldDefs.sortOrder);
}

/**
 * Fetches an attachment (including its file bytes) only if it belongs to
 * the given org. An attachment hangs off either a task or a checklist item
 * (never both — see the exactly-one-parent check constraint), so whichever
 * parent is set is walked up to org, task -> project -> program -> org or
 * checklist item -> task -> project -> program -> org. Used by the download
 * route, which only has the attachment id to go on.
 */
export async function getAttachmentForOrg(attachmentId: string, orgId: string) {
  const [attachment] = await db.select().from(attachments).where(eq(attachments.id, attachmentId)).limit(1);
  if (!attachment) return null;

  if (attachment.taskId) {
    const task = await db
      .select({ id: tasks.id })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .innerJoin(programs, eq(projects.programId, programs.id))
      .where(and(eq(tasks.id, attachment.taskId), eq(programs.orgId, orgId)))
      .limit(1);
    return task.length > 0 ? attachment : null;
  }

  if (attachment.checklistItemId) {
    const item = await db
      .select({ id: checklistItems.id })
      .from(checklistItems)
      .innerJoin(tasks, eq(checklistItems.taskId, tasks.id))
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .innerJoin(programs, eq(projects.programId, programs.id))
      .where(and(eq(checklistItems.id, attachment.checklistItemId), eq(programs.orgId, orgId)))
      .limit(1);
    return item.length > 0 ? attachment : null;
  }

  if (attachment.whiteboardId) {
    const board = await db
      .select({ id: whiteboards.id })
      .from(whiteboards)
      .where(and(eq(whiteboards.id, attachment.whiteboardId), eq(whiteboards.orgId, orgId)))
      .limit(1);
    return board.length > 0 ? attachment : null;
  }

  return null;
}

const assignedTaskColumns = {
  id: tasks.id,
  title: tasks.title,
  status: tasks.status,
  priority: tasks.priority,
  dueDate: tasks.dueDate,
  projectId: projects.id,
  projectName: projects.name,
  programId: programs.id,
};

/**
 * The user's tasks for the My Tasks page, filtered and sorted in SQL and
 * only the columns the table shows: open ones by due date (undated last),
 * and the most recently touched finished ones. Both lists are capped (the
 * open one only when `openLimit` is set) so one person with a very long
 * backlog can't produce a multi-megabyte page.
 */
export async function getAssignedTasks(
  orgId: string,
  userId: string,
  { openLimit, closedLimit = 50 }: { openLimit?: number; closedLimit?: number } = {},
) {
  const scope = and(eq(programs.orgId, orgId), eq(tasks.assigneeId, userId));
  const finished = ["completed", "cancelled"] as const;
  const [open, closed] = await Promise.all([
    db
      .select(assignedTaskColumns)
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .innerJoin(programs, eq(projects.programId, programs.id))
      .where(and(scope, notInArray(tasks.status, [...finished])))
      .orderBy(sql`${tasks.dueDate} asc nulls last`, asc(tasks.title))
      .limit(openLimit === undefined ? Number.MAX_SAFE_INTEGER : openLimit + 1),
    db
      .select(assignedTaskColumns)
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .innerJoin(programs, eq(projects.programId, programs.id))
      .where(and(scope, inArray(tasks.status, [...finished])))
      .orderBy(desc(tasks.updatedAt))
      .limit(closedLimit + 1),
  ]);
  return {
    open: openLimit === undefined ? open : open.slice(0, openLimit),
    moreOpen: openLimit !== undefined && open.length > openLimit,
    closed: closed.slice(0, closedLimit),
    moreClosed: closed.length > closedLimit,
  };
}

/** Task count per project across the org, for the sidebar tree — one aggregate query, no task rows. */
export async function getProjectTaskCounts(orgId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ projectId: tasks.projectId, count: count() })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .innerJoin(programs, eq(projects.programId, programs.id))
    .where(eq(programs.orgId, orgId))
    .groupBy(tasks.projectId);
  return new Map(rows.map((row) => [row.projectId, row.count]));
}

/** How many not-yet-finished tasks are assigned to the user — the sidebar's My Tasks badge. */
export async function countOpenTasksForAssignee(orgId: string, userId: string): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .innerJoin(programs, eq(projects.programId, programs.id))
    .where(
      and(
        eq(programs.orgId, orgId),
        eq(tasks.assigneeId, userId),
        notInArray(tasks.status, ["completed", "cancelled"]),
      ),
    );
  return row?.count ?? 0;
}

/**
 * Every task across an org's programs/projects, flattened with its
 * program/project context attached — used anywhere that needs to slice the
 * org's full task list by an arbitrary predicate (Reports, My Tasks)
 * rather than one project's tasks.
 */
export async function getOrgTasksFlat(orgId: string) {
  const orgPrograms = await db.query.programs.findMany({
    where: eq(programs.orgId, orgId),
    with: {
      projects: {
        with: {
          tasks: { with: { assignee: { columns: { id: true, name: true } } } },
        },
      },
    },
  });

  return orgPrograms.flatMap((program) =>
    program.projects.flatMap((project) =>
      project.tasks.map((task) => ({
        ...task,
        programId: program.id,
        programName: program.name,
        projectId: project.id,
        projectName: project.name,
        projectStatus: project.status,
        projectStartDate: project.startDate,
        projectDueDate: project.dueDate,
      })),
    ),
  );
}

/**
 * Every task in one portfolio's programs/projects, flattened the same way
 * as getOrgTasksFlat — powers the Portfolio-level Reports view.
 */
export async function getPortfolioTasksFlat(portfolioId: string, orgId: string) {
  const portfolioPrograms = await db.query.programs.findMany({
    where: and(eq(programs.portfolioId, portfolioId), eq(programs.orgId, orgId)),
    with: {
      projects: {
        with: {
          tasks: { with: { assignee: { columns: { id: true, name: true } } } },
        },
      },
    },
  });

  return portfolioPrograms.flatMap((program) =>
    program.projects.flatMap((project) =>
      project.tasks.map((task) => ({
        ...task,
        programId: program.id,
        programName: program.name,
        projectId: project.id,
        projectName: project.name,
        projectStatus: project.status,
        projectStartDate: project.startDate,
        projectDueDate: project.dueDate,
      })),
    ),
  );
}

/**
 * Every task in one program's projects, flattened — powers the
 * Program-level Reports view. Assumes the caller has already verified the
 * program belongs to the org (e.g. via getProgramForOrg).
 */
export async function getProgramTasksFlat(programId: string) {
  const program = await db.query.programs.findFirst({
    where: eq(programs.id, programId),
    with: {
      projects: {
        with: {
          tasks: { with: { assignee: { columns: { id: true, name: true } } } },
        },
      },
    },
  });
  if (!program) return [];

  return program.projects.flatMap((project) =>
    project.tasks.map((task) => ({
      ...task,
      programId: program.id,
      programName: program.name,
      projectId: project.id,
      projectName: project.name,
      projectStatus: project.status,
      projectStartDate: project.startDate,
      projectDueDate: project.dueDate,
    })),
  );
}

/**
 * Every task in one project, with its assignee — powers the Project-level
 * Reports view. Assumes the caller has already verified the project
 * belongs to the org (e.g. via getProjectForProgram).
 */
export async function getProjectTasksFlat(projectId: string) {
  return db.query.tasks.findMany({
    where: eq(tasks.projectId, projectId),
    with: { assignee: { columns: { id: true, name: true } } },
  });
}

type OrgAttachmentBase = {
  id: string;
  fileName: string;
  sizeBytes: number | null;
  contentType: string | null;
  createdAt: Date;
  uploadedByName: string;
  itemTitle: string;
};

export type OrgAttachmentRow =
  | (OrgAttachmentBase & {
      itemKind: "task" | "checklist_item";
      itemStatus: string;
      programId: string;
      programName: string;
      projectId: string;
      projectName: string;
      taskId: string;
      checklistItemId: string | null;
    })
  | (OrgAttachmentBase & { itemKind: "whiteboard"; whiteboardId: string });

/**
 * Every attachment across an org, with the task or checklist item it's
 * attached to (and that item's current status) — feeds the admin
 * Attachments page, which exists to find old/large files worth deleting
 * to reclaim storage (attachment bytes live directly in Postgres as
 * bytea, see db/schema.ts). An attachment hangs off exactly one of a
 * task, a checklist item or a whiteboard (images on the canvas; see the
 * exactly-one-parent check constraint), so this runs one query per parent
 * kind and merges them rather than one query with outer joins.
 */
export async function getOrgAttachmentsDetailed(orgId: string): Promise<OrgAttachmentRow[]> {
  const taskAttachments = await db
    .select({
      id: attachments.id,
      fileName: attachments.fileName,
      sizeBytes: attachments.sizeBytes,
      contentType: attachments.contentType,
      createdAt: attachments.createdAt,
      uploadedByName: users.name,
      itemTitle: tasks.title,
      itemStatus: tasks.status,
      programId: programs.id,
      programName: programs.name,
      projectId: projects.id,
      projectName: projects.name,
      taskId: tasks.id,
    })
    .from(attachments)
    .innerJoin(users, eq(attachments.uploadedById, users.id))
    .innerJoin(tasks, eq(attachments.taskId, tasks.id))
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .innerJoin(programs, eq(projects.programId, programs.id))
    .where(eq(programs.orgId, orgId));

  const checklistItemAttachments = await db
    .select({
      id: attachments.id,
      fileName: attachments.fileName,
      sizeBytes: attachments.sizeBytes,
      contentType: attachments.contentType,
      createdAt: attachments.createdAt,
      uploadedByName: users.name,
      itemTitle: checklistItems.title,
      itemStatus: checklistItems.status,
      programId: programs.id,
      programName: programs.name,
      projectId: projects.id,
      projectName: projects.name,
      taskId: tasks.id,
      checklistItemId: checklistItems.id,
    })
    .from(attachments)
    .innerJoin(users, eq(attachments.uploadedById, users.id))
    .innerJoin(checklistItems, eq(attachments.checklistItemId, checklistItems.id))
    .innerJoin(tasks, eq(checklistItems.taskId, tasks.id))
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .innerJoin(programs, eq(projects.programId, programs.id))
    .where(eq(programs.orgId, orgId));

  const whiteboardAttachments = await db
    .select({
      id: attachments.id,
      fileName: attachments.fileName,
      sizeBytes: attachments.sizeBytes,
      contentType: attachments.contentType,
      createdAt: attachments.createdAt,
      uploadedByName: users.name,
      itemTitle: whiteboards.name,
      whiteboardId: whiteboards.id,
    })
    .from(attachments)
    .innerJoin(users, eq(attachments.uploadedById, users.id))
    .innerJoin(whiteboards, eq(attachments.whiteboardId, whiteboards.id))
    .where(eq(whiteboards.orgId, orgId));

  return [
    ...taskAttachments.map((row) => ({ ...row, itemKind: "task" as const, checklistItemId: null })),
    ...checklistItemAttachments.map((row) => ({ ...row, itemKind: "checklist_item" as const })),
    ...whiteboardAttachments.map((row) => ({ ...row, itemKind: "whiteboard" as const })),
  ];
}

/** Comments left on tasks assigned to the given user, across the org, most recent first. */
export async function getCommentsOnMyTasks(userId: string, orgId: string) {
  return db
    .select({
      id: comments.id,
      body: comments.body,
      createdAt: comments.createdAt,
      authorName: users.name,
      taskId: tasks.id,
      taskTitle: tasks.title,
      projectId: projects.id,
      programId: programs.id,
    })
    .from(comments)
    .innerJoin(tasks, eq(comments.taskId, tasks.id))
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .innerJoin(programs, eq(projects.programId, programs.id))
    .innerJoin(users, eq(comments.authorId, users.id))
    .where(and(eq(tasks.assigneeId, userId), eq(programs.orgId, orgId)))
    .orderBy(desc(comments.createdAt))
    .limit(50);
}

/** Relations to load with a board so `whiteboardLinkInfo` can describe its Project/Program link. */
const whiteboardLinkRelations = {
  project: {
    columns: { id: true, name: true, programId: true },
    with: { program: { columns: { name: true } } },
  },
  program: { columns: { id: true, name: true } },
} as const;

/**
 * Fetches a whiteboard only if it belongs to the given org — prevents
 * cross-org access. `data` (the canvas, up to a couple of MB) is only
 * loaded when asked for, since autosave and version polling just need the
 * ownership check and `version`.
 */
export async function getWhiteboardForOrg<WithData extends boolean = false>(
  whiteboardId: string,
  orgId: string,
  { withData }: { withData?: WithData } = {},
) {
  const board = await db.query.whiteboards.findFirst({
    where: and(eq(whiteboards.id, whiteboardId), eq(whiteboards.orgId, orgId)),
    columns: {
      id: true,
      orgId: true,
      name: true,
      version: true,
      createdById: true,
      createdAt: true,
      updatedAt: true,
      thumbnailUpdatedAt: true,
      data: (withData ?? false) as WithData,
    },
    with: { createdBy: { columns: { name: true } }, updatedBy: { columns: { name: true } }, ...whiteboardLinkRelations },
  });

  return board ?? null;
}

/**
 * The org's whiteboards, most recently edited first. `data` (the whole
 * canvas) is only loaded when asked for — the list panel beside every
 * whiteboard page needs just names and timestamps.
 */
export async function getOrgWhiteboards<WithData extends boolean = false>(
  orgId: string,
  { withData }: { withData?: WithData } = {},
) {
  return db.query.whiteboards.findMany({
    where: eq(whiteboards.orgId, orgId),
    columns: {
      id: true,
      name: true,
      createdById: true,
      createdAt: true,
      updatedAt: true,
      thumbnailUpdatedAt: true,
      data: (withData ?? false) as WithData,
    },
    extras: {
      itemCount: sql<number>`coalesce(jsonb_array_length(${whiteboards.data} -> 'nodes'), 0)`.as("item_count"),
      commentCount: sql<number>`(select count(*)::int from comments where comments.whiteboard_id = ${whiteboards.id})`.as(
        "comment_count",
      ),
    },
    with: { createdBy: { columns: { name: true } }, updatedBy: { columns: { name: true } }, ...whiteboardLinkRelations },
    orderBy: [desc(whiteboards.updatedAt)],
  });
}

/**
 * A board's discussion, oldest first. Callers must have org-checked the
 * board (e.g. via `getWhiteboardForOrg`); the author is name-only.
 */
export async function getWhiteboardComments(whiteboardId: string) {
  return db.query.comments.findMany({
    where: eq(comments.whiteboardId, whiteboardId),
    columns: { id: true, body: true, createdAt: true, authorId: true },
    with: { author: { columns: { name: true } } },
    orderBy: [asc(comments.createdAt)],
  });
}
export type WhiteboardComment = Awaited<ReturnType<typeof getWhiteboardComments>>[number];

/** `data` for just the given boards (org-checked) — e.g. those with no thumbnail yet. */
export async function getWhiteboardDocsForOrg(orgId: string, whiteboardIds: string[]) {
  if (whiteboardIds.length === 0) return new Map<string, unknown>();
  const rows = await db
    .select({ id: whiteboards.id, data: whiteboards.data })
    .from(whiteboards)
    .where(and(eq(whiteboards.orgId, orgId), inArray(whiteboards.id, whiteboardIds)));
  return new Map(rows.map((row) => [row.id, row.data as unknown]));
}

/**
 * Boards linked to a project, or to a program and (optionally) any of its
 * projects — for the Whiteboards section on those pages. Always org-scoped.
 */
export async function getLinkedWhiteboards(
  orgId: string,
  target: { projectId: string } | { programId: string; includeProjects?: boolean },
) {
  let condition;
  if ("projectId" in target) {
    condition = eq(whiteboards.projectId, target.projectId);
  } else if (target.includeProjects) {
    const programProjects = db.select({ id: projects.id }).from(projects).where(eq(projects.programId, target.programId));
    condition = or(eq(whiteboards.programId, target.programId), inArray(whiteboards.projectId, programProjects));
  } else {
    condition = eq(whiteboards.programId, target.programId);
  }
  return db.query.whiteboards.findMany({
    where: and(eq(whiteboards.orgId, orgId), condition),
    columns: { id: true, name: true, updatedAt: true, thumbnailUpdatedAt: true },
    with: { updatedBy: { columns: { name: true } }, ...whiteboardLinkRelations },
    orderBy: [desc(whiteboards.updatedAt)],
  });
}

/** Every program with its projects (names only), for the whiteboard link picker. */
export async function getOrgLinkTargets(orgId: string) {
  return db.query.programs.findMany({
    where: eq(programs.orgId, orgId),
    columns: { id: true, name: true },
    with: { projects: { columns: { id: true, name: true }, orderBy: (project, { asc }) => [asc(project.name)] } },
    orderBy: (program, { asc }) => [asc(program.name)],
  });
}
