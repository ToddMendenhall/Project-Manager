import "server-only";

/**
 * Whether anyone can create a new organization from /register. On by
 * default; set ALLOW_REGISTRATION=false for a private deployment where
 * people only join through admin invites. Read at request time, so
 * changing it needs only a redeploy/restart, not a rebuild of the code.
 */
export function isRegistrationOpen() {
  return process.env.ALLOW_REGISTRATION?.trim().toLowerCase() !== "false";
}
