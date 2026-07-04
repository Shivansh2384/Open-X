// Web search module — free, no API key required.
//
// Designed to work reliably on BOTH local dev AND Vercel/cloud deployments.
//
// Problem: DuckDuckGo's HTML scraping endpoints block cloud provider IPs,
// and most SearXNG instances rate-limit server requests. This means search
// works locally but fails on Vercel.
//
// Solution: Use multiple cloud-friendly strategies in parallel:
//   1. Wiby.me JSON API — indie search engine, returns real results, cloud-friendly
//   2. Wikipedia search API — great for factual/knowledge queries
//   3. DuckDuckGo Instant Answer API — encyclopedia summaries (always works)
//   4. DuckDuckGo HTML lite scraping — real results (works locally only, fails gracefully on cloud)
//
// All strategies run with Promise.allSettled + fast timeouts. Best results win.

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

// ─── Strategy 1: Wiby.me JSON search (cloud-friendly) ──────────────────────
// An independent search engine that returns JSON results without blocking cloud IPs.

interface WibyResult {
  URL?: string;
  Title?: string;
  Snippet?: string;
}

async function searchWiby(query: string): Promise<SearchResult[]> {
  try {
    const url =
      "https://wiby.me/json/?" +
      new URLSearchParams({ q: query });

    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];

    const data = (await res.json()) as WibyResult[];
    if (!Array.isArray(data)) return [];

    const seen = new Set<string>();
    const results: SearchResult[] = [];
    for (const r of data) {
      const rUrl = r.URL?.trim();
      const title = clean(r.Title || "");
      const snippet = clean(r.Snippet || "");
      if (!rUrl || !title || seen.has(rUrl)) continue;
      seen.add(rUrl);
      results.push({ title, url: rUrl, snippet });
      if (results.length >= 6) break;
    }
    return results;
  } catch {
    return [];
  }
}

// ─── Strategy 2: Wikipedia search API (cloud-friendly, great for facts) ─────

interface WikiSearchResult {
  title?: string;
  snippet?: string;
  pageid?: number;
}

async function searchWikipedia(query: string): Promise<SearchResult[]> {
  try {
    const url =
      "https://en.wikipedia.org/w/api.php?" +
      new URLSearchParams({
        action: "query",
        list: "search",
        srsearch: query,
        format: "json",
        srlimit: "5",
        srprop: "snippet",
        origin: "*",
      });

    const res = await fetch(url, {
      headers: { "User-Agent": "OpenX/1.0", Accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];

    const data = (await res.json()) as {
      query?: { search?: WikiSearchResult[] };
    };
    if (!Array.isArray(data.query?.search)) return [];

    return data.query.search
      .filter((r) => r.title)
      .map((r) => ({
        title: r.title!,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title!.replace(/ /g, "_"))}`,
        snippet: clean(r.snippet || ""),
      }));
  } catch {
    return [];
  }
}

// ─── Strategy 3: DuckDuckGo Instant Answer API (always works from cloud) ────

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

// ─── Strategy 4: DuckDuckGo HTML lite scraping (local dev only) ─────────────
// Works locally but blocked from cloud IPs. Fast timeout so it doesn't slow
// anything down when deployed.

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
      results.push({ title, url: linkUrl, snippet: snippets[i] || "" });
    }

    return results;
  } catch {
    return [];
  }
}

// ─── Main search function ───────────────────────────────────────────────────

/**
 * Run a multi-strategy web search. All strategies run in parallel with fast
 * timeouts via Promise.allSettled. Works on local dev AND Vercel/cloud.
 * Never throws — returns an empty result set on total failure.
 */
export async function searchDuckDuckGo(
  query: string,
  _signal?: AbortSignal,
): Promise<SearchResponse> {
  const empty: SearchResponse = { query, results: [] };
  try {
    const [wibyResult, wikiResult, instantResult, htmlResult] =
      await Promise.allSettled([
        searchWiby(query),
        searchWikipedia(query),
        fetchInstantAnswer(query),
        scrapeHtmlLite(query),
      ]);

    const wibyResults =
      wibyResult.status === "fulfilled" ? wibyResult.value : [];
    const wikiResults =
      wikiResult.status === "fulfilled" ? wikiResult.value : [];
    const instant =
      instantResult.status === "fulfilled"
        ? instantResult.value
        : { topics: [] as SearchResult[] };
    const htmlResults =
      htmlResult.status === "fulfilled" ? htmlResult.value : [];

    // Merge results: DDG HTML first (best organic results when available),
    // then Wiby, then Wikipedia, then DDG instant topics
    const seen = new Set<string>();
    const results: SearchResult[] = [];

    for (const r of htmlResults) {
      if (!seen.has(r.url) && r.title) {
        seen.add(r.url);
        results.push(r);
      }
    }

    for (const r of wibyResults) {
      if (!seen.has(r.url) && r.title) {
        seen.add(r.url);
        results.push(r);
      }
    }

    for (const r of wikiResults) {
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
