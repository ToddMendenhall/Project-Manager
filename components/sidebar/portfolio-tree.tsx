"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type ProjectNode = { id: string; name: string; taskCount: number };
export type ProgramNode = { id: string; name: string; projects: ProjectNode[] };
export type PortfolioNode = { id: string; name: string; programs: ProgramNode[] };

export function PortfolioTree({
  portfolios,
  ungroupedPrograms,
}: {
  portfolios: PortfolioNode[];
  ungroupedPrograms: ProgramNode[];
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {portfolios.map((portfolio) => (
        <PortfolioRow key={portfolio.id} portfolio={portfolio} />
      ))}
      {ungroupedPrograms.length > 0 && (
        <div className="mt-2">
          <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Other Programs
          </p>
          <div className="flex flex-col gap-0.5">
            {ungroupedPrograms.map((program) => (
              <ProgramRow key={program.id} program={program} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TreeToggle({ open }: { open: boolean }) {
  return <span className="w-3 shrink-0 text-[10px] text-gray-400">{open ? "▾" : "▸"}</span>;
}

function PortfolioRow({ portfolio }: { portfolio: PortfolioNode }) {
  const [open, setOpen] = useState(true);
  const pathname = usePathname();
  const active = pathname === `/dashboard/portfolios/${portfolio.id}`;

  return (
    <div>
      <div
        className={`flex items-center gap-1 rounded px-2 py-1.5 text-sm hover:bg-gray-100 ${
          active ? "bg-gray-100" : ""
        }`}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="shrink-0 text-gray-400"
          aria-label={open ? "Collapse" : "Expand"}
        >
          <TreeToggle open={open} />
        </button>
        <Link
          href={`/dashboard/portfolios/${portfolio.id}`}
          className={`flex-1 truncate font-medium ${active ? "text-gray-900" : "text-gray-700 hover:text-gray-900"}`}
        >
          {portfolio.name}
        </Link>
      </div>
      {open && (
        <div className="ml-3 flex flex-col gap-0.5 border-l border-gray-200 pl-2">
          {portfolio.programs.length === 0 ? (
            <p className="px-2 py-1 text-xs text-gray-400">No programs</p>
          ) : (
            portfolio.programs.map((program) => <ProgramRow key={program.id} program={program} />)
          )}
        </div>
      )}
    </div>
  );
}

function ProgramRow({ program }: { program: ProgramNode }) {
  const [open, setOpen] = useState(true);
  const pathname = usePathname();
  const active = pathname === `/dashboard/programs/${program.id}`;

  return (
    <div>
      <div
        className={`flex items-center gap-1 rounded px-2 py-1.5 text-sm hover:bg-gray-100 ${
          active ? "bg-gray-100" : ""
        }`}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="shrink-0 text-gray-400"
          aria-label={open ? "Collapse" : "Expand"}
        >
          <TreeToggle open={open} />
        </button>
        <Link
          href={`/dashboard/programs/${program.id}`}
          className={`flex-1 truncate ${active ? "font-medium text-gray-900" : "text-gray-700 hover:text-gray-900"}`}
        >
          {program.name}
        </Link>
      </div>
      {open && (
        <div className="ml-3 flex flex-col gap-0.5 border-l border-gray-200 pl-2">
          {program.projects.length === 0 ? (
            <p className="px-2 py-1 text-xs text-gray-400">No projects</p>
          ) : (
            program.projects.map((project) => (
              <ProjectRow key={project.id} programId={program.id} project={project} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ProjectRow({ programId, project }: { programId: string; project: ProjectNode }) {
  const pathname = usePathname();
  const href = `/dashboard/programs/${programId}/projects/${project.id}`;
  const active = pathname?.startsWith(href) ?? false;

  return (
    <Link
      href={href}
      className={`flex items-center justify-between rounded px-2 py-1.5 text-sm ${
        active ? "bg-gray-100 font-medium text-gray-900" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
      }`}
    >
      <span className="truncate">{project.name}</span>
      {project.taskCount > 0 && <span className="shrink-0 pl-2 text-xs text-gray-400">{project.taskCount}</span>}
    </Link>
  );
}
