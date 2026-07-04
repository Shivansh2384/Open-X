// DuckDuckGo real-time web search (free, no API key required).
//
// Uses TWO strategies for maximum coverage:
//   1. DuckDuckGo HTML lite search (lite.duckduckgo.com) — returns real organic
//      search results with snippets, similar to what you'd see in the browser.
//      This is the primary source and returns actual real-time data.
//   2. DuckDuckGo Instant Answer API (api.duckduckgo.com) — returns authoritative
//      summaries for factual/entity queries. Used as a supplement.
//
// This runs entirely server-side and injects fresh context into the AI prompt.

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
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** Strip any leftover HTML tags and decode entities. */
function clean(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
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

// ─── Strategy 1: DuckDuckGo HTML Lite Search (real organic results) ─────────

/**
 * Scrapes DuckDuckGo's HTML lite endpoint for real organic search results.
 * This returns actual web results — time, weather, news, prices, etc.
 */
async function scrapeHtmlResults(
  query: string,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  try {
    const url =
      "https://lite.duckduckgo.com/lite/?" +
      new URLSearchParams({ q: query, kl: "wt-wt" });

    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept-Language": "en-US,en;q=0.9",
        Accept: "text/html",
      },
      signal,
    });
    if (!res.ok) return [];

    const html = await res.text();
    const results: SearchResult[] = [];
    const seen = new Set<string>();

    // Parse the lite HTML structure: each result has a link in a <a> tag
    // and a snippet in the following <td> with class "result-snippet"
    // Pattern: extract result links and their associated snippets
    const linkRegex =
      /<a[^>]+rel="nofollow"[^>]+href="([^"]+)"[^>]*>\s*([\s\S]*?)\s*<\/a>/gi;
    const snippetRegex =
      /<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi;

    const links: { url: string; title: string }[] = [];
    let match: RegExpExecArray | null;

    while ((match = linkRegex.exec(html)) !== null) {
      const href = clean(match[1]);
      const title = clean(match[2]);
      if (
        href &&
        title &&
        !href.includes("duckduckgo.com") &&
        href.startsWith("http")
      ) {
        links.push({ url: href, title });
      }
    }

    const snippets: string[] = [];
    while ((match = snippetRegex.exec(html)) !== null) {
      snippets.push(clean(match[1]));
    }

    for (let i = 0; i < links.length && results.length < 8; i++) {
      const { url: linkUrl, title } = links[i];
      if (seen.has(linkUrl)) continue;
      seen.add(linkUrl);
      results.push({
        title,
        url: linkUrl,
        snippet: snippets[i] || "",
      });
    }

    return results;
  } catch {
    return [];
  }
}

// ─── Strategy 2: DuckDuckGo HTML search (standard) ─────────────────────────

/**
 * Scrapes DuckDuckGo's standard HTML search page for results.
 * Backup for when the lite version fails.
 */
async function scrapeStandardResults(
  query: string,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  try {
    const url =
      "https://html.duckduckgo.com/html/?" +
      new URLSearchParams({ q: query });

    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept-Language": "en-US,en;q=0.9",
        Accept: "text/html",
      },
      signal,
    });
    if (!res.ok) return [];

    const html = await res.text();
    const results: SearchResult[] = [];
    const seen = new Set<string>();

    // Parse results from DuckDuckGo HTML search
    // Results are in <div class="result"> blocks
    const resultRegex =
      /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippetBlockRegex =
      /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

    const links: { url: string; title: string }[] = [];
    let match: RegExpExecArray | null;

    while ((match = resultRegex.exec(html)) !== null) {
      let href = clean(match[1]);
      const title = clean(match[2]);
      // DuckDuckGo wraps URLs in redirect; extract actual URL
      if (href.includes("uddg=")) {
        try {
          const decoded = decodeURIComponent(
            href.split("uddg=")[1]?.split("&")[0] || "",
          );
          if (decoded.startsWith("http")) href = decoded;
        } catch {
          /* keep original */
        }
      }
      if (href && title && href.startsWith("http")) {
        links.push({ url: href, title });
      }
    }

    const snippets: string[] = [];
    while ((match = snippetBlockRegex.exec(html)) !== null) {
      snippets.push(clean(match[1]));
    }

    for (let i = 0; i < links.length && results.length < 8; i++) {
      const { url: linkUrl, title } = links[i];
      if (seen.has(linkUrl)) continue;
      seen.add(linkUrl);
      results.push({
        title,
        url: linkUrl,
        snippet: snippets[i] || "",
      });
    }

    return results;
  } catch {
    return [];
  }
}

// ─── Strategy 3: DuckDuckGo Instant Answer API (encyclopedia) ───────────────

async function fetchInstantAnswer(
  query: string,
  signal?: AbortSignal,
): Promise<{
  abstract?: { text: string; source: string; url: string };
  topics: SearchResult[];
}> {
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
    if (!res.ok) return { topics: [] };

    const data = (await res.json()) as {
      AbstractText?: string;
      AbstractSource?: string;
      AbstractURL?: string;
      Answer?: string;
      Definition?: string;
      Heading?: string;
      RelatedTopics?: DDGTopic[];
    };

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

    const seen = new Set<string>();
    const topics: SearchResult[] = [];
    for (const t of flattenTopics(data.RelatedTopics)) {
      const text = clean(t.Text || "");
      const tUrl = clean(t.FirstURL || "");
      if (!text || !tUrl || seen.has(tUrl)) continue;
      seen.add(tUrl);
      topics.push({ title: titleFromText(text), url: tUrl, snippet: text });
      if (topics.length >= 4) break;
    }

    return { abstract, topics };
  } catch {
    return { topics: [] };
  }
}

/**
 * Run a comprehensive DuckDuckGo search combining multiple strategies.
 * Returns real organic search results + optional encyclopedia summary.
 * Never throws — on failure returns an empty result set.
 */
export async function searchDuckDuckGo(
  query: string,
  signal?: AbortSignal,
): Promise<SearchResponse> {
  const empty: SearchResponse = { query, results: [] };
  try {
    // Run HTML scrape + Instant Answer API in parallel for speed
    const [htmlResults, standardResults, instantAnswer] = await Promise.all([
      scrapeHtmlResults(query, signal),
      scrapeStandardResults(query, signal),
      fetchInstantAnswer(query, signal),
    ]);

    // Merge results: prefer HTML scrape results, supplement with standard and instant answer
    const seen = new Set<string>();
    const results: SearchResult[] = [];

    // First: real organic results from HTML lite search
    for (const r of htmlResults) {
      if (!seen.has(r.url) && r.title) {
        seen.add(r.url);
        results.push(r);
      }
    }

    // Second: standard HTML results as backup
    for (const r of standardResults) {
      if (!seen.has(r.url) && r.title) {
        seen.add(r.url);
        results.push(r);
      }
    }

    // Third: instant answer related topics (lower priority)
    for (const r of instantAnswer.topics) {
      if (!seen.has(r.url) && r.title) {
        seen.add(r.url);
        results.push(r);
      }
    }

    return {
      query,
      abstract: instantAnswer.abstract,
      results: results.slice(0, 8),
    };
  } catch {
    return empty;
  }
}

/** Render search results into a compact text block for the AI prompt. */
export function formatSearchForPrompt(s: SearchResponse): string {
  const now = new Date();
  const timestamp = now.toLocaleString("en-US", {
    timeZone: "UTC",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });

  const lines: string[] = [];
  lines.push(
    `REAL-TIME WEB SEARCH RESULTS for "${s.query}" — fetched at ${timestamp}:`,
  );
  if (s.abstract) {
    lines.push(
      `Summary (${s.abstract.source}): ${s.abstract.text}${s.abstract.url ? ` (${s.abstract.url})` : ""}`,
    );
  }
  if (s.results.length > 0) {
    lines.push("Web sources:");
    s.results.forEach((r, i) => {
      lines.push(`${i + 1}. ${r.title} — ${r.snippet} (${r.url})`);
    });
  }
  lines.push("");
  lines.push(
    "INSTRUCTIONS: The search results above are LIVE, REAL-TIME data fetched just now from the internet. " +
      "You MUST use this data to answer the user's question. " +
      "If the user asks about time, weather, news, prices, scores, dates, events, or ANY factual/current information, " +
      "answer directly using these results. " +
      "Do NOT say you lack real-time data — you have it right here. " +
      "Do NOT say you cannot access the internet — the search was already performed for you. " +
      "Present the information confidently and cite the sources when helpful.",
  );
  return lines.join("\n");
}
