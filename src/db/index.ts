// Database connection (Drizzle + node-postgres).
//
// Made OPTIONAL: if DATABASE_URL is not set (e.g. on Vercel without a DB), we
// export a null `db` instead of crashing. The chat app itself is 100%
// localStorage-based and does NOT need a database; only the optional health
// check does, and it degrades gracefully when no DB is present.

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool = databaseUrl
  ? (globalForDb.__arenaNextJsPostgresqlPool ??
    new Pool({ connectionString: databaseUrl }))
  : null;

if (pool && process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

// `db` is null when no DATABASE_URL is configured. Callers must null-check.
export const db = pool ? drizzle(pool) : null;
