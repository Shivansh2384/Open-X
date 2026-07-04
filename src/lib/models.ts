// ───────────────────────────────────────────────────────────────────────────
// OpenX Model Registry
//
// This is the single source of truth for the UI model -> backend model mapping.
// Backend provider/model identifiers live ONLY here (server-side). The browser
// never sees provider/model strings — it only ever receives PublicModel objects
// (see getPublicModels / the /api/models route).
//
// To add a new model later: add an entry to MODELS below. No other change needed.
// ───────────────────────────────────────────────────────────────────────────

import type { PublicModel } from "./types";
import { DEFAULT_MODEL_ID } from "./types";

export { DEFAULT_MODEL_ID };

/** Supported backend providers. Add new providers in src/lib/providers/. */
export type ModelProvider = "nvidia" | "glm";

export interface ModelConfig {
  /** Stable public id (what the client sends as `model`). */
  id: string;
  /** Human-friendly name shown in the UI. */
  label: string;
  /** Short marketing description for the dropdown. */
  description: string;
  /** Optional badge, e.g. "Default", "Beta", "Fast". */
  badge?: string;
  // ── Backend-only fields (never serialized to the client) ────────────────
  provider: ModelProvider;
  /** The real backend model identifier, e.g. "nvidia/nemotron-3-ultra-550b-a55b". */
  model: string;
  temperature?: number;
  /** Nucleus sampling (top_p), used by some models. */
  topP?: number;
  maxTokens?: number;
  /**
   * Provider-specific request body fields merged into the API call, e.g.
   * { reasoning_budget, chat_template_kwargs: { enable_thinking } }. Lets each
   * model declare its own knobs without touching the streaming core.
   */
  extraBody?: Record<string, unknown>;
}

export const MODELS: Record<string, ModelConfig> = {
  "shivansh-ai-1.1": {
    id: "shivansh-ai-1.1",
    label: "ShivanshAI-1.1",
    description: "Powerful, reasoning-enabled & unlimited",
    badge: "Default",
    // UI alias -> real backend model. NVIDIA Nemotron-3-Ultra via NVIDIA NIM.
    provider: "nvidia",
    model: "nvidia/nemotron-3-ultra-550b-a55b",
    temperature: 1,
    topP: 0.95,
    maxTokens: 16384,
    // Enable the model's chain-of-thought ("thinking") with full reasoning budget.
    extraBody: {
      reasoning_budget: 16384,
      chat_template_kwargs: { enable_thinking: true },
    },
  },
};

export function getModel(id: string | null | undefined): ModelConfig | undefined {
  if (id && MODELS[id]) return MODELS[id];
  return MODELS[DEFAULT_MODEL_ID];
}

/** Resolve a public model id to its backend provider + model. Server only. */
export function resolveBackend(id: string | null | undefined) {
  const config = getModel(id) ?? getModel(DEFAULT_MODEL_ID)!;
  return {
    provider: config.provider,
    model: config.model,
    temperature: config.temperature,
    topP: config.topP,
    maxTokens: config.maxTokens,
    extraBody: config.extraBody,
  };
}

/** Returns a client-safe list of models (no provider/model leakage). */
export function getPublicModels(): PublicModel[] {
  return Object.values(MODELS).map(({ id, label, description, badge }) => ({
    id,
    label,
    description,
    badge,
  }));
}
