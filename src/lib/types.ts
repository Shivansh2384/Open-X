// Shared domain types for OpenX.
// Kept dependency-free so they can be imported by both client and server code.

export type Role = "user" | "assistant" | "system";

/** A single chat message as stored locally (localStorage). */
export interface Message {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
  /** True while the assistant message is still streaming. */
  pending?: boolean;
  /** True if this message represents an error state. */
  error?: boolean;
  /** True while a web search is running (before the answer streams). */
  searching?: boolean;
  /** The model's chain-of-thought (reasoning models stream this first). */
  reasoning?: string;
  /** Web search sources (when "Web search" was enabled for this message). */
  sources?: SearchSource[];
}

/** A web search result surfaced to the UI when "Web search" is on. */
export interface SearchSource {
  title: string;
  url: string;
  snippet: string;
}

/**
 * A single streamed event in the OpenX SSE wire format:
 *   { token }     – a content delta
 *   { reasoning } – a thinking/reasoning delta
 *   { searching } – notifies the UI that a web search is running
 *   { sources }   – the web search results found (before the answer)
 *   { error }     – a fatal error
 */
export type ChatStreamEvent =
  | { token: string }
  | { reasoning: string }
  | { searching: true }
  | { sources: SearchSource[] }
  | { error: string };

/** A conversation with its full message history. */
export interface Chat {
  id: string;
  title: string;
  model: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

/**
 * The message shape sent to /api/chat.
 * The backend owns the system prompt; clients never send role:"system".
 */
export interface ApiMessage {
  role: "user" | "assistant";
  content: string;
}

/** Model metadata that is safe to expose to the browser. */
export interface PublicModel {
  id: string;
  label: string;
  description: string;
  badge?: string;
}

/**
 * Default public model id. Lives here (not in the server-only registry) so
 * client code can import it without pulling backend provider/model strings
 * into the browser bundle.
 */
export const DEFAULT_MODEL_ID = "shivansh-ai-1.1";
