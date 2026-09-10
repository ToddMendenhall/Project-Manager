// Shared between the server-side tree builder (lib/gantt-tree.ts) and the
// client GanttView component — kept free of "server-only"/"use client" so
// both sides can import it as plain types.

export type GanttKind = "portfolio" | "program" | "project" | "task" | "checklistItem";

export type GanttNode = {
  id: string;
  title: string;
  status: string;
  href: string;
  startDate: Date | string | null;
  endDate: Date | string | null;
  kind: GanttKind;
  children?: GanttNode[];
};
