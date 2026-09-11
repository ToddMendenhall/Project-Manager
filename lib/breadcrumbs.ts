import type { Crumb } from "@/components/views/breadcrumbs";

const ALL_PORTFOLIOS: Crumb = { label: "All Portfolios", href: "/dashboard/portfolios" };
const ALL_PROGRAMS: Crumb = { label: "All Programs", href: "/dashboard/programs" };

type PortfolioRef = { id: string; name: string } | null;
type ProgramRef = { id: string; name: string; portfolio: PortfolioRef };

/** Ancestors for a portfolio's own page. */
export function portfolioBreadcrumbs(): Crumb[] {
  return [ALL_PORTFOLIOS];
}

/** Ancestors for a program's own page. */
export function programBreadcrumbs(program: { portfolio: PortfolioRef }): Crumb[] {
  if (!program.portfolio) return [ALL_PROGRAMS];
  return [ALL_PORTFOLIOS, { label: program.portfolio.name, href: `/dashboard/portfolios/${program.portfolio.id}` }];
}

/** Ancestors for a project's own page. */
export function projectBreadcrumbs(program: ProgramRef): Crumb[] {
  return [...programBreadcrumbs(program), { label: program.name, href: `/dashboard/programs/${program.id}` }];
}

/** Ancestors for a task's own page. */
export function taskBreadcrumbs(program: ProgramRef, project: { id: string; name: string }): Crumb[] {
  return [
    ...projectBreadcrumbs(program),
    { label: project.name, href: `/dashboard/programs/${program.id}/projects/${project.id}` },
  ];
}

/** Ancestors for a checklist item's own page. */
export function checklistItemBreadcrumbs(
  program: ProgramRef,
  project: { id: string; name: string },
  task: { id: string; title: string },
): Crumb[] {
  return [
    ...taskBreadcrumbs(program, project),
    { label: task.title, href: `/dashboard/programs/${program.id}/projects/${project.id}/tasks/${task.id}` },
  ];
}
