export function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded border border-gray-200 bg-white p-4">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}
