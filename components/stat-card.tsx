export function StatCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-card border border-cy-gray-200 bg-white px-4 py-3 ${accent ? "border-t-[3px] border-t-cy-red-500" : ""}`}
    >
      <p className="font-mono text-[26px] font-semibold leading-none tabular-nums text-cy-gray-900">{value}</p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-label text-cy-gray-500">{label}</p>
    </div>
  );
}
