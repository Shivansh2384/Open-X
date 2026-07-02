// DuckDuckGo real-time web search (free, no API key required).
//
// Uses DuckDuckGo's OFFICIAL Instant Answer API (api.duckduckgo.com), which is
// key-free, reliable, and works from any server (no anti-bot blocking, unlike
// the HTML scrape endpoint). It returns authoritative summaries + related
// topics for factual/entity queries.
//
// This runs entirely server-side and injects fresh context into the AI prompt
// when the user enables "Web search".

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchResponse {
  query: string;
  abstract?: { text: string; source: string; url: string };
  results: SearchResult[];
}

interface DDGTopic {
  Text?: string;
  FirstURL?: string;
  Topics?: DDGTopic[];
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** Strip any leftover HTML and trim. */
function clean(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Derive a short title from a topic's text (everything before the first " - "). */
function titleFromText(text: string): string {
  const dash = text.indexOf(" - ");
  return dash > 0 ? text.slice(0, dash).trim() : text.split(".")[0].trim();
}

/** Recursively flatten RelatedTopics (which can contain nested Topic groups). */
function flattenTopics(topics: DDGTopic[] | undefined): DDGTopic[] {
  if (!Array.isArray(topics)) return [];
  const out: DDGTopic[] = [];
  for (const t of topics) {
    if (Array.isArray(t.Topics) && t.Topics.length > 0) {
      out.push(...flattenTopics(t.Topics));
    } else if (t.Text && t.FirstURL) {
      out.push(t);
    }
  }
  return out;
}

/**
 * Run a DuckDuckGo Instant Answer search. Returns a summary plus related
 * sources. Never throws — on failure returns an empty result set so the chat
 * always continues.
 */
export async function searchDuckDuckGo(
  query: string,
  signal?: AbortSignal,
): Promise<SearchResponse> {
  const empty: SearchResponse = { query, results: [] };
  try {
    const url =
      "https://api.duckduckgo.com/?" +
      new URLSearchParams({
        q: query,
        format: "json",
        no_html: "1",
        skip_disambig: "1",
        t: "openx",
      });

    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "en-US,en" },
      signal,
    });
    if (!res.ok) return empty;

    const data = (await res.json()) as {
      AbstractText?: string;
      AbstractSource?: string;
      AbstractURL?: string;
      Answer?: string;
      Definition?: string;
      Heading?: string;
      RelatedTopics?: DDGTopic[];
    };

    // Build the authoritative summary (prefer AbstractText, then Definition).
    const summary =
      clean(data.AbstractText || "") ||
      clean(data.Definition || "") ||
      clean(data.Answer || "");
    const abstract = summary
      ? {
          text: summary,
          source: data.AbstractSource || "DuckDuckGo",
          url: data.AbstractURL || "",
        }
      : undefined;

    // Build result sources from related topics.
    const seen = new Set<string>();
    const results: SearchResult[] = [];
    for (const t of flattenTopics(data.RelatedTopics)) {
      const text = clean(t.Text || "");
      const url = clean(t.FirstURL || "");
      if (!text || !url || seen.has(url)) continue;
      seen.add(url);
      results.push({ title: titleFromText(text), url, snippet: text });
      if (results.length >= 6) break;
    }

    return { query, abstract, results };
  } catch {
    return empty;
  }
}

/** Render search results into a compact text block for the AI prompt. */
export function formatSearchForPrompt(s: SearchResponse): string {
  const lines: string[] = [];
  lines.push(`WEB SEARCH RESULTS for "${s.query}" (via DuckDuckGo, real-time):`);
  if (s.abstract) {
    lines.push(
      `Summary (${s.abstract.source}): ${s.abstract.text}${s.abstract.url ? ` (${s.abstract.url})` : ""}`,
    );
  }
  if (s.results.length > 0) {
    lines.push("Related sources:");
    s.results.forEach((r, i) => {
      lines.push(
        `${i + 1}. ${r.title} — ${r.snippet} (${r.url})`,
      );
    });
  }
  lines.push(
    "IMPORTANT: The above is real-time, up-to-date information from the web. " +
      "Base your answer on it and trust it over your own training data. " +
      "If it contains the answer (time, price, news, dates, facts), use it directly. " +
      "Do NOT say you don't know if the data above provides the answer.",
  );
  return lines.join("\n");
}
