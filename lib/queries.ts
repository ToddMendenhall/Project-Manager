import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { customFieldDefs, orgMembers, programs, projects, tasks, users } from "@/db/schema";

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

/** Task-level custom field definitions for a program, in display order. */
export async function getTaskCustomFieldDefs(programId: string) {
  return db
    .select()
    .from(customFieldDefs)
    .where(and(eq(customFieldDefs.programId, programId), eq(customFieldDefs.entityType, "task")))
    .orderBy(customFieldDefs.sortOrder);
}
