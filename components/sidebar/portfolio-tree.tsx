"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Plus } from "lucide-react";

export type ProjectNode = { id: string; name: string; taskCount: number };
export type ProgramNode = { id: string; name: string; projects: ProjectNode[] };
export type PortfolioNode = { id: string; name: string; programs: ProgramNode[] };

export function PortfolioTree({
  portfolios,
  ungroupedPrograms,
  isAdmin,
}: {
  portfolios: PortfolioNode[];
  ungroupedPrograms: ProgramNode[];
  isAdmin: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {portfolios.map((portfolio) => (
        <PortfolioRow key={portfolio.id} portfolio={portfolio} isAdmin={isAdmin} />
      ))}
      {ungroupedPrograms.length > 0 && (
        <div className="mt-2">
          <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-eyebrow text-cy-gray-400">
            Other Programs
          </p>
          <div className="flex flex-col gap-0.5">
            {ungroupedPrograms.map((program) => (
              <ProgramRow key={program.id} program={program} isAdmin={isAdmin} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TreeToggle({ open }: { open: boolean }) {
  return (
    <ChevronRight
      size={14}
      strokeWidth={2}
      className={`shrink-0 text-cy-gray-400 transition-transform duration-fast ${open ? "rotate-90" : ""}`}
    />
  );
}

function AddChildLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      onClick={(e) => e.stopPropagation()}
      className="shrink-0 px-1 text-cy-gray-400 opacity-0 hover:text-cy-blue-600 group-hover:opacity-100"
      title={label}
      aria-label={label}
    >
      <Plus size={14} strokeWidth={2} />
    </Link>
  );
}

function PortfolioRow({ portfolio, isAdmin }: { portfolio: PortfolioNode; isAdmin: boolean }) {
  const [open, setOpen] = useState(true);
  const pathname = usePathname();
  const active = pathname === `/dashboard/portfolios/${portfolio.id}`;

  return (
    <div>
      <div
        className={`group flex items-center gap-1 rounded px-2 py-1.5 text-sm hover:bg-cy-gray-050 ${
          active ? "bg-cy-gray-050" : ""
        }`}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="shrink-0"
          aria-label={open ? "Collapse" : "Expand"}
        >
          <TreeToggle open={open} />
        </button>
        <Link
          href={`/dashboard/portfolios/${portfolio.id}`}
          className={`flex-1 truncate text-[13px] font-semibold ${active ? "text-cy-gray-900" : "text-cy-gray-900 hover:text-cy-blue-600"}`}
        >
          {portfolio.name}
        </Link>
        {isAdmin && (
          <AddChildLink href={`/dashboard/programs/new?portfolioId=${portfolio.id}`} label="New Program" />
        )}
      </div>
      {open && (
        <div className="ml-3.5 flex flex-col gap-0.5 border-l border-cy-gray-100 pl-2">
          {portfolio.programs.length === 0 ? (
            <p className="px-2 py-1 text-xs text-cy-gray-400">No programs</p>
          ) : (
            portfolio.programs.map((program) => (
              <ProgramRow key={program.id} program={program} isAdmin={isAdmin} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ProgramRow({ program, isAdmin }: { program: ProgramNode; isAdmin: boolean }) {
  const [open, setOpen] = useState(true);
  const pathname = usePathname();
  const active = pathname === `/dashboard/programs/${program.id}`;

  return (
    <div>
      <div
        className={`group flex items-center gap-1 rounded px-2 py-1.5 text-sm hover:bg-cy-gray-050 ${
          active ? "bg-cy-gray-050" : ""
        }`}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="shrink-0"
          aria-label={open ? "Collapse" : "Expand"}
        >
          <TreeToggle open={open} />
        </button>
        <Link
          href={`/dashboard/programs/${program.id}`}
          className={`flex-1 truncate text-[13px] font-medium ${active ? "text-cy-gray-900" : "text-cy-gray-700 hover:text-cy-blue-600"}`}
        >
          {program.name}
        </Link>
        {isAdmin && (
          <AddChildLink href={`/dashboard/programs/${program.id}/projects/new`} label="New Project" />
        )}
      </div>
      {open && (
        <div className="ml-3.5 flex flex-col gap-0.5 border-l border-cy-gray-100 pl-2">
          {program.projects.length === 0 ? (
            <p className="px-2 py-1 text-xs text-cy-gray-400">No projects</p>
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
      className={`flex items-center justify-between rounded px-2 py-1.5 text-[13px] ${
        active
          ? "border border-cy-gray-200 bg-white font-semibold text-cy-blue-800"
          : "text-cy-gray-600 hover:bg-cy-gray-050 hover:text-cy-gray-900"
      }`}
    >
      <span className="truncate">{project.name}</span>
      {project.taskCount > 0 && (
        <span className="shrink-0 pl-2 font-mono text-[11px] text-cy-gray-400">{project.taskCount}</span>
      )}
    </Link>
  );
}
