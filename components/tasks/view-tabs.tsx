import Link from "next/link";

export function ViewTabs({
  basePath,
  active,
}: {
  basePath: string;
  active: "list" | "board" | "calendar";
}) {
  const tabs = [
    { key: "list" as const, label: "List", href: `${basePath}/tasks` },
    { key: "board" as const, label: "Board", href: `${basePath}/board` },
    { key: "calendar" as const, label: "Calendar", href: `${basePath}/calendar` },
  ];

  return (
    <div className="flex gap-4 border-b border-gray-200">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={`-mb-px border-b-2 px-1 pb-2 text-sm ${
            active === tab.key
              ? "border-gray-900 font-medium text-gray-900"
              : "border-transparent text-gray-500 hover:text-gray-900"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
