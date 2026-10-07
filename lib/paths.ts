/**
 * URLs of pages below a program. A project's page lives under its program
 * (`/dashboard/programs/<program>/projects/<project>`), so every link to a
 * project, task or checklist item needs the ids of all its parents. Build
 * them here instead of by hand. Client-safe.
 */
export function projectPath(programId: string, projectId: string) {
  return `/dashboard/programs/${programId}/projects/${projectId}`;
}

export function taskPath(programId: string, projectId: string, taskId: string) {
  return `${projectPath(programId, projectId)}/tasks/${taskId}`;
}

export function checklistItemPath(programId: string, projectId: string, taskId: string, itemId: string) {
  return `${taskPath(programId, projectId, taskId)}/checklist/${itemId}`;
}
