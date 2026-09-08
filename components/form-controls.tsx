import type { ReactNode } from "react";

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-gray-400">{hint}</span>}
    </label>
  );
}

export const inputClass = "rounded border border-gray-300 px-3 py-2";
export const textareaClass = "rounded border border-gray-300 px-3 py-2 min-h-[100px]";
export const selectClass = "rounded border border-gray-300 px-3 py-2 bg-white";
