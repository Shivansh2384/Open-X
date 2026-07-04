// Real-time data enrichment — intentionally kept minimal.
//
// The current UTC time is always injected via formatSearchForPrompt().
// The AI model already knows every timezone offset — it just needs "now".
// No hardcoding needed for time, stocks, weather, or anything else.
// Google News RSS + DuckDuckGo handle the actual search.

export interface RealtimeEnrichment {
  data: string;
  type: string;
}

/**
 * Stub — all real-time enrichment is now handled by the search module itself
 * (UTC time is always included in formatSearchForPrompt). This function
 * exists so the import in route.ts doesn't break.
 */
export async function getRealtimeEnrichment(
  _query: string,
): Promise<RealtimeEnrichment | null> {
  return null;
}
