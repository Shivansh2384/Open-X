// Generic OpenAI-compatible streaming core.
//
// Both GLM (Z.AI) and NVIDIA NIM speak the same OpenAI Chat Completions wire
// format over SSE:
//   POST {base}/chat/completions   Authorization: Bearer <key>
//   stream chunks: data: {json}\n\n  ...  data: [DONE]
//
// Each provider module is just a thin wrapper that supplies its base URL,
// API key, and default model. This is the only place that parses SSE, so
// adding a new OpenAI-compatible backend later needs no parser changes.

export interface WireMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenAIStreamArgs {
  /** Base URL, e.g. "https://integrate.api.nvidia.com/v1". */
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: WireMessage[];
  temperature?: number;
  /** Nucleus sampling (top_p). */
  topP?: number;
  maxTokens?: number;
  /** Provider-specific fields merged into the request body (e.g. reasoning_budget). */
  extraBody?: Record<string, unknown>;
  signal?: AbortSignal;
}

/** A streamed delta from the model: answer content and/or reasoning/thinking. */
export interface StreamDelta {
  content?: string;
  reasoning?: string;
}

/**
 * Resolves the base URL (or a full endpoint) to the chat-completions URL.
 * Accepts "https://host/v1" -> ".../v1/chat/completions" as well as an already
 * complete "https://host/v1/chat/completions".
 */
function resolveEndpoint(base: string): string {
  const url = base.trim().replace(/\/+$/, "");
  return /\/chat\/completions$/i.test(url) ? url : `${url}/chat/completions`;
}

/**
 * Streams a chat completion and yields content + reasoning deltas as they
 * arrive. Throws a descriptive Error on any non-2xx response.
 */
export async function* streamOpenAICompatible(
  args: OpenAIStreamArgs,
): AsyncGenerator<StreamDelta, void, unknown> {
  const {
    apiKey,
    model,
    messages,
    temperature,
    topP,
    maxTokens,
    extraBody,
    signal,
    baseUrl,
  } = args;
  if (!apiKey) {
    throw new Error("Provider API key is not configured.");
  }

  const res = await fetch(resolveEndpoint(baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "Accept-Language": "en-US,en",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: temperature ?? 0.7,
      ...(topP != null ? { top_p: topP } : {}),
      ...(maxTokens ? { max_tokens: maxTokens } : {}),
      ...(extraBody ?? {}),
      stream: true,
    }),
    signal,
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Model request failed (${res.status}). ${detail.slice(0, 300)}`.trim(),
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    // Keep the last (possibly partial) line in the buffer.
    buffer = lines.pop() ?? "";

    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") return;
      if (!payload) continue;
      try {
        const json = JSON.parse(payload);
        const delta = json?.choices?.[0]?.delta ?? {};
        const content = delta?.content;
        const reasoning = delta?.reasoning_content;
        if (typeof content === "string" && content.length > 0) {
          yield { content };
        }
        if (typeof reasoning === "string" && reasoning.length > 0) {
          yield { reasoning };
        }
      } catch {
        // Ignore keep-alive comments and partial JSON chunks.
      }
    }
  }
}
