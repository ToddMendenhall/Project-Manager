import "server-only";
import { createHash } from "crypto";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { authRateLimits } from "@/db/schema";

/**
 * Database-backed fixed-window rate limiting for unauthenticated endpoints.
 * Serverless functions share no memory between invocations, so the counter
 * has to live in Postgres; one small upsert per attempt is cheap.
 *
 * Fails open: if the limiter's own query errors, the attempt is allowed
 * (and the error logged) — a broken limiter must not lock everyone out.
 */
export type RateLimitRule = { name: string; limit: number; windowSeconds: number };

export const RATE_LIMITS = {
  /** Failed sign-ins per account. Low enough to stop guessing, high enough that a typo-prone user isn't locked out. */
  loginEmail: { name: "login-email", limit: 10, windowSeconds: 15 * 60 },
  /** Failed sign-ins per client IP, across all accounts (password spraying). */
  loginIp: { name: "login-ip", limit: 30, windowSeconds: 15 * 60 },
  /** New organizations registered per client IP. */
  registerIp: { name: "register-ip", limit: 5, windowSeconds: 60 * 60 },
  /** Invites created per admin (each one also tells them whether an email has an account). */
  inviteCreate: { name: "invite-create", limit: 30, windowSeconds: 60 * 60 },
} satisfies Record<string, RateLimitRule>;

const keyFor = (rule: RateLimitRule, id: string) =>
  createHash("sha256").update(`${rule.name}:${id.toLowerCase()}`).digest("hex");

/** Seconds until the caller may try again, or 0 if not currently limited. */
export async function retryAfterSeconds(rule: RateLimitRule, id: string): Promise<number> {
  try {
    const [row] = await db
      .select({ count: authRateLimits.count, windowStart: authRateLimits.windowStart })
      .from(authRateLimits)
      .where(
        and(
          eq(authRateLimits.key, keyFor(rule, id)),
          gte(authRateLimits.windowStart, sql`now() - make_interval(secs => ${rule.windowSeconds})`),
        ),
      )
      .limit(1);
    if (!row || row.count < rule.limit) return 0;
    const resetsAt = row.windowStart.getTime() + rule.windowSeconds * 1000;
    return Math.max(1, Math.ceil((resetsAt - Date.now()) / 1000));
  } catch (err) {
    console.error("[rate-limit] check failed, allowing attempt:", err);
    return 0;
  }
}

/** Counts one attempt against the rule, starting a fresh window if the old one has expired. */
export async function recordAttempt(rule: RateLimitRule, id: string): Promise<void> {
  const expired = sql`${authRateLimits.windowStart} < now() - make_interval(secs => ${rule.windowSeconds})`;
  try {
    await db
      .insert(authRateLimits)
      .values({ key: keyFor(rule, id), count: 1 })
      .onConflictDoUpdate({
        target: authRateLimits.key,
        set: {
          count: sql`case when ${expired} then 1 else ${authRateLimits.count} + 1 end`,
          windowStart: sql`case when ${expired} then now() else ${authRateLimits.windowStart} end`,
        },
      });
    // Occasionally sweep counters whose window ended long ago, so the table
    // stays small even when someone cycles through many emails or IPs.
    if (Math.random() < 0.05) {
      await db.delete(authRateLimits).where(lt(authRateLimits.windowStart, sql`now() - interval '1 day'`));
    }
  } catch (err) {
    console.error("[rate-limit] record failed:", err);
  }
}

/** Forgets the rule's attempts for `id` — e.g. after a successful sign-in. */
export async function clearAttempts(rule: RateLimitRule, id: string): Promise<void> {
  try {
    await db.delete(authRateLimits).where(eq(authRateLimits.key, keyFor(rule, id)));
  } catch (err) {
    console.error("[rate-limit] clear failed:", err);
  }
}

/**
 * The client's IP. On Vercel, `x-real-ip` / `x-forwarded-for` are set by the
 * platform from the actual connection, so a client can't spoof them. Behind
 * another proxy, make sure it overwrites (not appends to) these headers.
 */
export function clientIp(headers: Headers): string {
  return (
    headers.get("x-real-ip")?.trim() ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}
