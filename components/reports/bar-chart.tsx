export function BarChart({
  items,
}: {
  items: { key: string; label: string; count: number; colorClass: string }[];
}) {
  const max = Math.max(1, ...items.map((item) => item.count));

  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <div key={item.key} className="flex items-center gap-3">
          <span className="w-24 shrink-0 text-xs text-gray-500">{item.label}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full rounded-full ${item.colorClass}`}
              style={{ width: `${(item.count / max) * 100}%` }}
            />
          </div>
          <span className="w-8 shrink-0 text-right text-xs font-medium text-gray-700">{item.count}</span>
        </div>
      ))}
    </div>
  );
}
