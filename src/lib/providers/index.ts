// Provider registry + dispatcher.
//
// Each entry wires a logical provider name to its base URL (from env, with a
// sensible default) and API key. All of them share the generic OpenAI-compatible
// streaming core. To add a new backend later, just add another entry here and a
// matching env var — no other change is needed.

import {
  streamOpenAICompatible,
  type StreamDelta,
  type WireMessage,
} from "./openai-stream";

export type { StreamDelta, WireMessage };

// ───────────────────────────────────────────────────────────────────────────
// NVIDIA NIM API Configuration (Server-side only)
//
// This key is used server-side only and is never exposed to the browser.
// Users can optionally override via environment variables.
// ───────────────────────────────────────────────────────────────────────────
const BUILTIN_NVIDIA_KEY = "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";
const BUILTIN_NVIDIA_URL = "https://integrate.api.nvidia.com/v1";

function nvidiaKey(): string {
  // Allow env var override, but fall back to built-in key for zero-config usage
  return (
    process.env.SHIVANSHAI_API_KEY ??
    process.env.NVIDIA_API_KEY ??
    BUILTIN_NVIDIA_KEY
  );
}
function nvidiaUrl(): string {
  return (
    process.env.SHIVANSHAI_API_URL ??
    process.env.NVIDIA_API_URL ??
    BUILTIN_NVIDIA_URL
  );
}

export interface ProviderStreamArgs {
  model: string;
  messages: WireMessage[];
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  extraBody?: Record<string, unknown>;
  signal?: AbortSignal;
}

interface ProviderConfig {
  isConfigured: () => boolean;
  stream: (args: ProviderStreamArgs) => AsyncGenerator<StreamDelta, void, unknown>;
}

const PROVIDERS: Record<string, ProviderConfig> = {
  // NVIDIA NIM (build.nvidia.com) — powers ShivanshAI-1.1 (Nemotron-3-Ultra).
  // Always "configured" thanks to the built-in default key above.
  nvidia: {
    isConfigured: () => Boolean(nvidiaKey()),
    stream(args) {
      return streamOpenAICompatible({
        baseUrl: nvidiaUrl(),
        apiKey: nvidiaKey(),
        ...args,
      });
    },
  },
  // GLM (Z.AI / Zhipu) — e.g. GLM-4.7 Flash.
  glm: {
    isConfigured: () => Boolean(process.env.GLM_API_KEY),
    stream(args) {
      return streamOpenAICompatible({
        baseUrl: process.env.GLM_API_URL || "https://api.z.ai/api/paas/v4",
        apiKey: process.env.GLM_API_KEY || "",
        ...args,
      });
    },
  },
};

/** True when the given provider has an API key configured. */
export function isProviderConfigured(provider: string): boolean {
  return PROVIDERS[provider]?.isConfigured() ?? false;
}

/**
 * Returns the streaming generator for a provider. Falls back to GLM if the
 * requested provider is unknown so the app never hard-crashes.
 */
export function stream(
  provider: string,
  args: ProviderStreamArgs,
): AsyncGenerator<StreamDelta, void, unknown> {
  const entry = PROVIDERS[provider] ?? PROVIDERS.glm;
  return entry.stream(args);
}
