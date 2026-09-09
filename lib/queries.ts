import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  attachments,
  checklistItems,
  customFieldDefs,
  orgMembers,
  portfolios,
  programs,
  projects,
  tasks,
  users,
} from "@/db/schema";

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

  return null;
}
