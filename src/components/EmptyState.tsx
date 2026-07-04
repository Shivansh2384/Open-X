"use client";

import { Code2, Lightbulb, PenLine, Sparkles } from "lucide-react";
import { Logo } from "./Logo";

const EXAMPLES = [
  {
    icon: PenLine,
    title: "Write something",
    prompt: "Write a short, upbeat product tagline for a coffee app called Brewd.",
  },
  {
    icon: Code2,
    title: "Explain code",
    prompt:
      "Explain what a JavaScript debounce function does and show me one with comments.",
  },
  {
    icon: Lightbulb,
    title: "Brainstorm ideas",
    prompt: "Give me 5 creative weekend project ideas for a beginner developer.",
  },
  {
    icon: Sparkles,
    title: "Plan a trip",
    prompt: "Plan a relaxed 3-day itinerary for a first visit to Kyoto in spring.",
  },
];

export function EmptyState({
  modelName,
  onPick,
}: {
  modelName: string;
  onPick: (prompt: string) => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4 py-10">
      <div className="animate-slide-up text-center">
        <div className="mb-6 flex justify-center">
          <Logo size={64} />
        </div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Welcome to <span className="brand-gradient-text">OpenX</span>
        </h1>
        <p className="mx-auto mt-3 max-w-md text-balance text-muted">
          Unlimited AI. No login. No limits. Ask anything — powered by{" "}
          <span className="font-semibold text-foreground">{modelName}</span>.
        </p>
      </div>

      <div className="mt-10 grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
        {EXAMPLES.map((ex, i) => (
          <button
            key={ex.title}
            type="button"
            onClick={() => onPick(ex.prompt)}
            style={{ animationDelay: `${i * 70 + 80}ms` }}
            className="group animate-slide-up flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 text-left transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-lg hover:shadow-black/5"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
              <ex.icon className="h-[18px] w-[18px]" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">
                {ex.title}
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted line-clamp-2">
                {ex.prompt}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
