// Browser-side streaming client for /api/chat.
//
// Talks the OpenX SSE wire format emitted by the server:
//   data: {"token":"..."}\n\n     -> a streamed text delta
//   data: {"error":"..."}\n\n     -> a fatal error
//   data: [DONE]\n\n              -> end of stream

import type { ApiMessage } from "./types";

/** Error thrown by the chat client (kept distinct from generic Error). */
export class ChatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatError";
  }
}

export interface StreamChatOptions {
  model: string;
  messages: ApiMessage[];
  webSearch?: boolean;
  signal?: AbortSignal;
}

/** A streamed delta received from /api/chat: answer content, reasoning, search. */
export interface ChatDelta {
  token?: string;
  reasoning?: string;
  searching?: boolean;
  sources?: { title: string; url: string; snippet: string }[];
}

/**
 * POSTs to /api/chat and yields streamed deltas as they arrive.
 * Throws ChatError on any non-2xx response or server-reported error.
 */
export async function* streamChat(
  opts: StreamChatOptions,
): AsyncGenerator<ChatDelta, void, unknown> {
  const { model, messages, webSearch, signal } = opts;

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, webSearch: !!webSearch }),
    signal,
  });

  if (!res.ok || !res.body) {
    let message = `Request failed (${res.status}). Please try again.`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      /* keep default message */
    }
    throw new ChatError(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") {
        if (payload === "[DONE]") return;
        continue;
      }
      try {
        const json = JSON.parse(payload) as {
          token?: string;
          reasoning?: string;
          searching?: boolean;
          sources?: { title: string; url: string; snippet: string }[];
          error?: string;
        };
        if (json.error) throw new ChatError(json.error);
        if (json.searching) yield { searching: true };
        if (Array.isArray(json.sources)) yield { sources: json.sources };
        if (typeof json.token === "string" && json.token.length > 0) {
          yield { token: json.token };
        }
        if (typeof json.reasoning === "string" && json.reasoning.length > 0) {
          yield { reasoning: json.reasoning };
        }
      } catch (err) {
        if (err instanceof ChatError) throw err;
        // otherwise ignore malformed chunk
      }
    }
  }
}
