/**
 * The dashboard sidebar's user-adjustable width (see ResizableSidebar).
 * Stored in a cookie rather than localStorage so the server renders the
 * chosen width directly — no jump from the default on page load.
 */
export const SIDEBAR_WIDTH_COOKIE = "sidebar-width";
export const SIDEBAR_DEFAULT_WIDTH = 256;
export const SIDEBAR_MIN_WIDTH = 200;
export const SIDEBAR_MAX_WIDTH = 640;

export function clampSidebarWidth(value: number) {
  if (!Number.isFinite(value)) return SIDEBAR_DEFAULT_WIDTH;
  return Math.round(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, value)));
}

/** Parses the cookie value; anything missing or malformed means the default width. */
export function parseSidebarWidth(raw: string | undefined) {
  return raw ? clampSidebarWidth(Number(raw)) : SIDEBAR_DEFAULT_WIDTH;
}
