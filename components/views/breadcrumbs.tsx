import Link from "next/link";

export type Crumb = { label: string; href: string };

/**
 * Replaces a single "← back" link with the full ancestor chain, each level
 * clickable — lets the user jump straight to any level above the one
 * they're on instead of climbing back one page at a time.
 */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="flex flex-wrap items-center gap-1.5 text-sm text-gray-500">
      {items.map((item, i) => (
        <span key={item.href} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-gray-300">/</span>}
          <Link href={item.href} className="hover:text-gray-900 hover:underline">
            {item.label}
          </Link>
        </span>
      ))}
    </nav>
  );
}
