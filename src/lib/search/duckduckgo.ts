// Web search module — free, no API key required.
//
// Designed to work on BOTH local dev AND Vercel/cloud deployments.
//
// DuckDuckGo HTML scraping is blocked from cloud provider IPs, so we use
// multiple strategies in parallel:
//   1. Google News RSS — real-time news results, works from anywhere
//   2. DuckDuckGo Instant Answer API — encyclopedia summaries
//   3. DuckDuckGo HTML lite scraping — organic results (local dev only)
//
// All run with Promise.allSettled + fast timeouts. Whatever returns, gets used.

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

function titleFromText(text: string): string {
  const dash = text.indexOf(" - ");
  return dash > 0 ? text.slice(0, dash).trim() : text.split(".")[0].trim();
}

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

// ─── Strategy 1: Google News RSS (works from cloud, real-time results) ──────
// Google News RSS is free, needs no API key, and returns actual recent
// articles with titles, sources, and dates. Works from ANY IP.

async function searchGoogleNews(query: string): Promise<SearchResult[]> {
  try {
    const url =
      "https://news.google.com/rss/search?" +
      new URLSearchParams({
        q: query,
        hl: "en-US",
        gl: "US",
        ceid: "US:en",
      });

    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];

    const xml = await res.text();
    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];

    const results: SearchResult[] = [];
    const seen = new Set<string>();

    for (const item of items) {
      if (results.length >= 8) break;

      const titleMatch = item.match(/<title>([\s\S]*?)<\/title>/);
      const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/) ||
                        item.match(/<link[^>]*href="([^"]+)"/);
      const sourceMatch = item.match(/<source[^>]*>([^<]+)<\/source>/);
      const dateMatch = item.match(/<pubDate>([^<]+)<\/pubDate>/);

      const title = clean(titleMatch?.[1] || "");
      let link = clean(linkMatch?.[1] || "");
      const source = clean(sourceMatch?.[1] || "");
      const date = dateMatch?.[1]?.trim() || "";

      if (!title || !link || seen.has(link)) continue;

      // Google News wraps links through their redirect. Keep as-is since
      // they still work as clickable URLs.
      seen.add(link);

      // Build a useful snippet from source + date
      const snippetParts: string[] = [];
      if (source) snippetParts.push(source);
      if (date) {
        // Format the date more readably
        try {
          const d = new Date(date);
          snippetParts.push(
            d.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            }),
          );
        } catch {
          snippetParts.push(date);
        }
      }

      results.push({
        title,
        url: link,
        snippet: snippetParts.join(" · "),
      });
    }

    return results;
  } catch {
    return [];
  }
}

// ─── Strategy 2: DuckDuckGo Instant Answer API (always works) ───────────────

async function fetchInstantAnswer(query: string): Promise<{
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
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { topics: [] };

    const data = (await res.json()) as {
      AbstractText?: string;
      AbstractSource?: string;
      AbstractURL?: string;
      Answer?: string;
      Definition?: string;
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

// ─── Strategy 3: DuckDuckGo HTML lite (local dev bonus, blocked on cloud) ───

async function scrapeHtmlLite(query: string): Promise<SearchResult[]> {
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
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return [];

    const html = await res.text();
    const results: SearchResult[] = [];
    const seen = new Set<string>();

    const linkRegex =
      /<a[^>]+rel="nofollow"[^>]+href="([^"]+)"[^>]*>\s*([\s\S]*?)\s*<\/a>/gi;
    const snippetRegex =
      /<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi;

    const links: { url: string; title: string }[] = [];
    let match: RegExpExecArray | null;

    while ((match = linkRegex.exec(html)) !== null) {
      const href = clean(match[1]);
      const title = clean(match[2]);
      if (href && title && !href.includes("duckduckgo.com") && href.startsWith("http")) {
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
      results.push({ title, url: linkUrl, snippet: snippets[i] || "" });
    }

    return results;
  } catch {
    return [];
  }
}

// ─── Main search ────────────────────────────────────────────────────────────

/**
 * Multi-strategy web search. All run in parallel via Promise.allSettled.
 * Works on local dev AND Vercel/cloud. Never throws.
 */
export async function searchDuckDuckGo(
  query: string,
  _signal?: AbortSignal,
): Promise<SearchResponse> {
  const empty: SearchResponse = { query, results: [] };
  try {
    const [newsResult, instantResult, htmlResult] = await Promise.allSettled([
      searchGoogleNews(query),
      fetchInstantAnswer(query),
      scrapeHtmlLite(query),
    ]);

    const newsResults =
      newsResult.status === "fulfilled" ? newsResult.value : [];
    const instant =
      instantResult.status === "fulfilled"
        ? instantResult.value
        : { topics: [] as SearchResult[] };
    const htmlResults =
      htmlResult.status === "fulfilled" ? htmlResult.value : [];

    // Merge: DDG HTML first (best organic when available, local only),
    // then Google News (real-time, works from cloud), then DDG topics
    const seen = new Set<string>();
    const results: SearchResult[] = [];

    for (const r of htmlResults) {
      if (!seen.has(r.url) && r.title) {
        seen.add(r.url);
        results.push(r);
      }
    }

    for (const r of newsResults) {
      if (!seen.has(r.url) && r.title) {
        seen.add(r.url);
        results.push(r);
      }
    }

    for (const r of instant.topics) {
      if (!seen.has(r.url) && r.title) {
        seen.add(r.url);
        results.push(r);
      }
    }

    return {
      query,
      abstract: instant.abstract,
      results: results.slice(0, 8),
    };
  } catch {
    return empty;
  }
}

/** Render search results into a compact text block for the AI prompt. */
export function formatSearchForPrompt(s: SearchResponse): string {
  const now = new Date();
  const timestamp = now.toUTCString();

  const lines: string[] = [];
  lines.push(
    `REAL-TIME WEB SEARCH RESULTS for "${s.query}" — fetched at ${timestamp}:`,
  );
  lines.push(`Current server UTC time: ${now.toISOString()}`);
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
    "INSTRUCTIONS: The above data is LIVE and REAL-TIME. " +
      "Use it to answer the user's question directly. " +
      "The current UTC time is also provided — use it to calculate time for any timezone the user asks about. " +
      "Do NOT say you lack real-time data. Do NOT say you cannot access the internet. " +
      "Answer confidently using the data above.",
  );
  return lines.join("\n");
}
