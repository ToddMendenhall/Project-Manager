import type { WhiteboardPreviewRect } from "@/lib/whiteboard";

/** Static thumbnail for a board card: its nodes as colored blocks, scaled to fit. */
export function WhiteboardPreview({ rects }: { rects: WhiteboardPreviewRect[] }) {
  if (rects.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-cy-gray-400">Empty whiteboard</div>
    );
  }
  return (
    <svg viewBox="-0.06 -0.06 1.12 1.12" preserveAspectRatio="xMidYMid meet" className="h-full w-full" aria-hidden>
      {rects.map((r, i) => (
        <rect
          key={i}
          x={r.x}
          y={r.y}
          width={r.w}
          height={r.h}
          rx={r.round ? Math.min(r.w, r.h) / 2 : 0.006}
          fill={r.fill}
          stroke="#8a929b"
          strokeWidth={0.003}
        />
      ))}
    </svg>
  );
}
