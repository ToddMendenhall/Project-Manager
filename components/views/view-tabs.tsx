import Link from "next/link";

export type ViewKey = "overview" | "list" | "board" | "calendar" | "gantt";

const VIEW_LABELS: Record<ViewKey, string> = {
  overview: "Overview",
  list: "List",
  board: "Board",
  calendar: "Calendar",
  gantt: "Gantt",
};

const DEFAULT_VIEWS: ViewKey[] = ["overview", "list", "board", "calendar", "gantt"];

function defaultHref(basePath: string, key: ViewKey) {
  return key === "overview" ? basePath : `${basePath}/${key}`;
}

export function ViewTabs({
  basePath,
  active,
  views = DEFAULT_VIEWS,
  hrefs,
}: {
  basePath: string;
  active: ViewKey;
  views?: ViewKey[];
  hrefs?: Partial<Record<ViewKey, string>>;
}) {
  return (
    <div className="flex gap-4 border-b border-gray-200">
      {views.map((key) => (
        <Link
          key={key}
          href={hrefs?.[key] ?? defaultHref(basePath, key)}
          className={`-mb-px border-b-2 px-1 pb-2 text-sm ${
            active === key
              ? "border-gray-900 font-medium text-gray-900"
              : "border-transparent text-gray-500 hover:text-gray-900"
          }`}
        >
          {VIEW_LABELS[key]}
        </Link>
      ))}
    </div>
  );
}
