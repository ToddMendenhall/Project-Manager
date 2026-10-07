import { projectPath } from "@/lib/paths";
/**
 * A whiteboard's optional context link: one Project or one Program (never
 * both — see the check constraint on whiteboards). Client-safe: shared by
 * the server actions, the pages and the link picker.
 */
export type WhiteboardLink = { kind: "project" | "program"; id: string };

export type WhiteboardLinkInfo = WhiteboardLink & {
  name: string;
  href: string;
  /** For a project link, the program it belongs to. */
  programName?: string;
};

/** Program → projects names for the link picker. */
export type LinkTargetTree = { id: string; name: string; projects: { id: string; name: string }[] }[];

/** `<select>` option values: "project:<id>", "program:<id>", or "" for no link. */
export const encodeLink = (link: WhiteboardLink | null) => (link ? `${link.kind}:${link.id}` : "");

export function decodeLink(value: string): WhiteboardLink | null {
  const [kind, id] = value.split(":");
  if ((kind === "project" || kind === "program") && id) return { kind, id };
  return null;
}

type LinkedRows = {
  project?: { id: string; name: string; programId: string; program?: { name: string } | null } | null;
  program?: { id: string; name: string } | null;
};

/** The display form of a board's link, from the `project`/`program` relations loaded with it. */
export function whiteboardLinkInfo(board: LinkedRows): WhiteboardLinkInfo | null {
  if (board.project) {
    return {
      kind: "project",
      id: board.project.id,
      name: board.project.name,
      programName: board.project.program?.name,
      href: projectPath(board.project.programId, board.project.id),
    };
  }
  if (board.program) {
    return { kind: "program", id: board.program.id, name: board.program.name, href: `/dashboard/programs/${board.program.id}` };
  }
  return null;
}
