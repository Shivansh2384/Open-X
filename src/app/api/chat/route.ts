// OpenX single chat endpoint.
//
// The browser only ever knows the public model id (e.g. "shivansh-ai-1.1").
// This route is the ONLY place that resolves that alias to a real backend
// model and holds the secret API key — keeping the abstraction clean and the
// key off the client.
//
// Wire format (SSE):
//   data: {"token":"..."}\n\n   streamed delta
//   data: {"error":"..."}\n\n   fatal error (stream then closes)
//   data: [DONE]\n\n            end

import { resolveBackend, getModel, DEFAULT_MODEL_ID } from "@/lib/models";
import {
  isProviderConfigured,
  stream as streamModel,
  type WireMessage,
} from "@/lib/providers";
import { searchDuckDuckGo, formatSearchForPrompt } from "@/lib/search/duckduckgo";
import type { ApiMessage, ChatStreamEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT =
  "You are OpenX, a fast, friendly, and highly capable AI assistant powered by the ShivanshAI-1.1 model. " +
  "Answer clearly and concisely, and format responses with Markdown when helpful " +
  "(headings, lists, tables, and fenced code blocks with a language tag). " +
  "You are unlimited and free to use.";

const MAX_MESSAGES = 40;

interface ChatRequestBody {
  model?: string;
  messages?: unknown;
  webSearch?: boolean;
}

function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

/** Normalize + sanitize the incoming message list into trusted ApiMessages. */
function sanitizeMessages(raw: unknown): ApiMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: ApiMessage[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const { role, content } = entry as Record<string, unknown>;
    if (
      (role === "user" || role === "assistant") &&
      typeof content === "string" &&
      content.trim().length > 0
    ) {
      out.push({ role, content });
    }
  }
  return out;
}

function buildApiMessages(history: ApiMessage[]): WireMessage[] {
  const trimmed = history.slice(-MAX_MESSAGES);
  // Collapse a leading run of assistant messages so the conversation starts
  // with a user turn (required by most chat models).
  const firstUser = trimmed.findIndex((m) => m.role === "user");
  const cleaned = firstUser > 0 ? trimmed.slice(firstUser) : trimmed;
  return [{ role: "system", content: SYSTEM_PROMPT }, ...cleaned];
}

/**
 * Heuristic to detect whether a user query likely needs real-time web data.
 * Returns true for questions about time, weather, news, prices, current events, etc.
 */
function needsWebSearch(query: string): boolean {
  const q = query.toLowerCase();
  const patterns = [
    // Time-related
    /\bwhat\s+time\b/,
    /\bcurrent\s+time\b/,
    /\btime\s+(?:in|at|now)\b/,
    /\btoday[''s]?\s+date\b/,
    /\bwhat\s+(?:day|date)\b/,
    // Weather
    /\bweather\b/,
    /\btemperature\b/,
    /\bforecast\b/,
    // News & current events
    /\bnews\b/,
    /\blatest\b/,
    /\brecent(?:ly)?\b/,
    /\bcurrent(?:ly)?\b/,
    /\btoday\b/,
    /\btonight\b/,
    /\byesterday\b/,
    /\bthis\s+(?:week|month|year)\b/,
    /\bright\s+now\b/,
    // Prices & stocks
    /\bprice\s+of\b/,
    /\bstock\s+price\b/,
    /\bhow\s+much\s+(?:is|does|are)\b/,
    /\bcrypto\b/,
    /\bbitcoin\b/,
    /\bethereum\b/,
    // Sports
    /\bscore\b/,
    /\bresults?\b.*\b(?:game|match|race)\b/,
    /\bwho\s+won\b/,
    // Search intent
    /\bsearch\s+(?:for|about)\b/,
    /\blook\s+up\b/,
    /\bfind\s+(?:me|out)\b/,
    /\bgoogle\b/,
    // Who/what is (often needs current info)
    /\bwho\s+is\s+the\s+(?:current|new|present)\b/,
    /\bwhat\s+is\s+the\s+(?:current|latest|new)\b/,
    // Release / launch
    /\brelease\s*date\b/,
    /\bwhen\s+(?:does|did|will|is)\b/,
    /\bhow\s+(?:old|tall|long)\s+is\b/,
  ];
  return patterns.some((p) => p.test(q));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Builds a rich Markdown reply used when no backend key is configured. */
function buildDemoReply(userText: string): string {
  const preview = userText.trim().slice(0, 80) || "your message";
  return [
    `### 👋 Welcome to **OpenX**`,
    ``,
    `You said: _"${preview}"_`,
    ``,
    `⚠️ **The ShivanshAI engine isn't connected yet.** ` +
      `You're seeing a placeholder reply. The site operator needs to add the ` +
      `\`SHIVANSHAI_API_KEY\` secret and redeploy.`,
    ``,
    `Here's what I can do once live:`,
    ``,
    `- ✍️  Write, summarize, and translate text`,
    `- 💻  Generate and explain **code**`,
    `- 🧠  Reason step-by-step through problems`,
    `- 📋  Format answers with tables and lists`,
    ``,
    `#### Example: a quick Python snippet`,
    ``,
    "```python",
    "def greet(name: str) -> str:",
    '    """Return a friendly greeting."""',
    '    return f"Hello, {name}! Welcome to OpenX."',
    "",
    "print(greet('Shivansh'))",
    "```",
    ``,
    `> Tip: try the **Regenerate** or **Copy** buttons on any of my replies.`,
    ``,
    `_Unlimited AI. No login. No limits._`,
  ].join("\n");
}

/** Streams a word-by-word demo reply through the SSE encoder. */
async function streamDemoReply(
  emit: (obj: ChatStreamEvent) => void,
  lastUserText: string,
) {
  const reply = buildDemoReply(lastUserText);
  const tokens = reply.match(/\S+\s*|\n/g) ?? [reply];
  for (const token of tokens) {
    emit({ token });
    await sleep(16);
  }
}

export async function POST(req: Request) {
  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return jsonError("Invalid request body.");
  }

  const config = getModel(body.model ?? DEFAULT_MODEL_ID);
  if (!config) {
    return jsonError("Unknown model selected.");
  }

  const history = sanitizeMessages(body.messages);
  if (history.length === 0) {
    return jsonError("No messages provided.");
  }

  const lastUser = [...history].reverse().find((m) => m.role === "user");
  const backend = resolveBackend(config.id);
  const userQuery = lastUser?.content ?? "";

  const encoder = new TextEncoder();
  const emit = (obj: ChatStreamEvent) => `data: ${JSON.stringify(obj)}\n\n`;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: ChatStreamEvent) =>
        controller.enqueue(encoder.encode(emit(obj)));

      try {
        // ── Real-time web search (DuckDuckGo) ──────────────────────────────
        // Runs when the user explicitly toggled web search ON, or when the
        // query heuristically looks like it needs live data (time, weather…).
        let apiMessages = buildApiMessages(history);

        const shouldSearch =
          (body.webSearch || needsWebSearch(userQuery)) && userQuery.trim();

        if (shouldSearch) {
          send({ searching: true });
          const search = await searchDuckDuckGo(userQuery);
          // Inject context whenever we found a summary and/or sources.
          if (search.abstract || search.results.length > 0) {
            if (search.results.length > 0) send({ sources: search.results });
            const searchContext = formatSearchForPrompt(search);
            // CRITICAL: merge search data INTO the user's message (not a 2nd
            // system message). Reasoning models only honor the first system
            // message, so a separate one gets ignored — this guarantees the
            // model actually reads the fresh data before answering.
            apiMessages = apiMessages.map((m, i) => {
              if (i === apiMessages.length - 1 && m.role === "user") {
                return {
                  ...m,
                  content: `${m.content}\n\n---\n${searchContext}`,
                };
              }
              return m;
            });
          }
        }

        if (!isProviderConfigured(backend.provider)) {
          // No backend key yet — stream a graceful, fully-rendered demo reply.
          await streamDemoReply(send, userQuery);
        } else {
          for await (const delta of streamModel(backend.provider, {
            model: backend.model,
            messages: apiMessages,
            temperature: backend.temperature,
            topP: backend.topP,
            maxTokens: backend.maxTokens,
            extraBody: backend.extraBody,
          })) {
            if (delta.content) send({ token: delta.content });
            if (delta.reasoning) send({ reasoning: delta.reasoning });
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (err) {
        const message =
          err instanceof Error && err.name === "AbortError"
            ? "Generation stopped."
            : err instanceof Error
              ? err.message
              : "Something went wrong while generating a response.";
        send({ error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
