import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

// prepare: false — required for Neon's (and most poolers') pooled connection
// endpoints, which run in transaction mode and don't support prepared
// statements across queries.
// idle_timeout — close connections idle for 20s instead of holding them
// open, which suits serverless functions and connection-limited databases.
//
// In development the client is cached on globalThis: `next dev` evaluates
// this module separately for each compiled route (and again on every hot
// reload), and without the cache each evaluation opens its own pool —
// enough routes and Postgres runs out of connections ("too many clients").
const globalForDb = globalThis as unknown as { pgClient?: ReturnType<typeof postgres> };
const client =
  globalForDb.pgClient ?? postgres(process.env.DATABASE_URL, { max: 10, prepare: false, idle_timeout: 20 });
if (process.env.NODE_ENV !== "production") globalForDb.pgClient = client;

export const db = drizzle(client, { schema });
