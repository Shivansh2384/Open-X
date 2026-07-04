// Direct DuckDuckGo search endpoint (free, no API key).
// GET /api/search?q=your+query  →  { query, abstract, results }

import { searchDuckDuckGo } from "@/lib/search/duckduckgo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  if (!q) {
    return Response.json({ error: "Missing ?q= query parameter." }, { status: 400 });
  }
  const result = await searchDuckDuckGo(q);
  return Response.json(result);
}
