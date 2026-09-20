import Link from "next/link";
import {
  BarChart3,
  Calendar,
  GanttChart,
  Kanban,
  LayoutDashboard,
  List as ListIcon,
  type LucideIcon,
} from "lucide-react";

export type ViewKey = "overview" | "list" | "board" | "calendar" | "gantt" | "reports";

const VIEW_LABELS: Record<ViewKey, string> = {
  overview: "Overview",
  list: "List",
  board: "Board",
  calendar: "Calendar",
  gantt: "Gantt",
  reports: "Reports",
};

const VIEW_ICONS: Record<ViewKey, LucideIcon> = {
  overview: LayoutDashboard,
  list: ListIcon,
  board: Kanban,
  calendar: Calendar,
  gantt: GanttChart,
  reports: BarChart3,
};

const DEFAULT_VIEWS: ViewKey[] = ["overview", "list", "board", "calendar", "gantt", "reports"];

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
    <div className="flex gap-5 border-b border-cy-gray-100">
      {views.map((key) => {
        const Icon = VIEW_ICONS[key];
        return (
          <Link
            key={key}
            href={hrefs?.[key] ?? defaultHref(basePath, key)}
            className={`-mb-px flex items-center gap-[7px] border-b-2 px-0.5 pb-2.5 text-[13px] transition-colors duration-base ${
              active === key
                ? "border-cy-blue-600 font-semibold text-cy-blue-800"
                : "border-transparent text-cy-gray-500 hover:text-cy-gray-900"
            }`}
          >
            <Icon size={15} strokeWidth={2} className={active === key ? "text-cy-blue-600" : "text-cy-gray-400"} />
            {VIEW_LABELS[key]}
          </Link>
        );
      })}
    </div>
  );
}
