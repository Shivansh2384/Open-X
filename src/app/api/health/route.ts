// Health check. Reports ok=true if reachable. Works with OR without a database:
// if no DATABASE_URL is configured (e.g. on Vercel), it reports ok based on the
// app process alone rather than crashing.

import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!db) {
    return Response.json({ ok: true, database: false });
  }
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, database: true });
  } catch {
    return Response.json({ ok: false, database: true }, { status: 500 });
  }
}
