const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Every id in the app is a uuid. Checking the shape before a query turns a
 * malformed id from a URL or request into "not found" (404) instead of a
 * Postgres "invalid input syntax for type uuid" error (500).
 */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}
