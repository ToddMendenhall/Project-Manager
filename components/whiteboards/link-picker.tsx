"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { FolderKanban, Link2 } from "lucide-react";
import { setWhiteboardLink } from "@/app/dashboard/whiteboards/actions";
import {
  decodeLink,
  encodeLink,
  type LinkTargetTree,
  type WhiteboardLinkInfo,
} from "@/lib/whiteboard-links";

/**
 * Shows which Project or Program a board belongs to (linking to that page)
 * and lets any member change or clear it. The link is context only — it
 * lists the board on that page — so changing it never touches the canvas.
 */
export function WhiteboardLinkPicker({
  whiteboardId,
  link: initialLink,
  targets,
}: {
  whiteboardId: string;
  link: WhiteboardLinkInfo | null;
  targets: LinkTargetTree;
}) {
  const [link, setLink] = useState(initialLink);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSave] = useTransition();

  function describe(value: string): WhiteboardLinkInfo | null {
    const next = decodeLink(value);
    if (!next) return null;
    for (const program of targets) {
      if (next.kind === "program" && program.id === next.id) {
        return { ...next, name: program.name, href: `/dashboard/programs/${program.id}` };
      }
      const project = program.projects.find((p) => next.kind === "project" && p.id === next.id);
      if (project) {
        return {
          ...next,
          name: project.name,
          programName: program.name,
          href: `/dashboard/programs/${program.id}/projects/${project.id}`,
        };
      }
    }
    return null;
  }

  function change(value: string) {
    const previous = link;
    // Send exactly what was picked; the server validates it belongs to this
    // org (the option list is only a convenience, not the security check).
    const picked = decodeLink(value);
    setLink(describe(value));
    setError(null);
    startSave(async () => {
      try {
        await setWhiteboardLink(whiteboardId, picked);
      } catch {
        setLink(previous);
        setError("Couldn't update the link.");
      }
    });
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5 text-xs">
      {link ? (
        <Link
          href={link.href}
          title={`Open ${link.kind === "project" ? "project" : "program"}`}
          className="flex min-w-0 items-center gap-1 rounded bg-cy-blue-100 px-2 py-1 font-medium text-cy-blue-800 hover:underline"
        >
          <FolderKanban size={12} className="shrink-0" />
          <span className="truncate">
            {link.programName ? `${link.programName} › ` : ""}
            {link.name}
          </span>
        </Link>
      ) : (
        <span className="flex items-center gap-1 text-cy-gray-400">
          <Link2 size={12} />
          Not linked
        </span>
      )}
      <select
        aria-label="Link whiteboard to a project or program"
        value={encodeLink(link)}
        disabled={isSaving}
        onChange={(e) => change(e.target.value)}
        className="max-w-[9rem] rounded border border-cy-gray-200 bg-white px-1.5 py-1 text-xs text-cy-gray-700 disabled:opacity-50"
      >
        <option value="">{link ? "Unlink" : "Link to…"}</option>
        {targets.map((program) => (
          <optgroup key={program.id} label={program.name}>
            <option value={encodeLink({ kind: "program", id: program.id })}>{program.name} (whole program)</option>
            {program.projects.map((project) => (
              <option key={project.id} value={encodeLink({ kind: "project", id: project.id })}>
                {project.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {error && <span className="text-cy-red-500">{error}</span>}
    </div>
  );
}
