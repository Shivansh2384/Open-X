"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Sparkles, Zap } from "lucide-react";
import type { PublicModel } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ModelSelector({
  models,
  selectedId,
  onSelect,
  className,
}: {
  models: PublicModel[];
  selectedId: string;
  onSelect: (id: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = models.find((m) => m.id === selectedId) ?? models[0];

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-border-strong"
      >
        <Zap className="h-4 w-4 text-primary" />
        <span className="max-w-[150px] truncate">{selected?.label ?? "Select model"}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-72 origin-top-left animate-fade-in overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-black/30">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
            <Sparkles className="h-3.5 w-3.5" />
            Choose a model
          </div>
          <ul className="max-h-80 overflow-y-auto p-1.5">
            {models.map((m) => {
              const active = m.id === selectedId;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(m.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "group flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                      active ? "bg-primary/10" : "hover:bg-surface-2",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "bg-surface-2 text-primary",
                      )}
                    >
                      <Zap className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-foreground">
                          {m.label}
                        </span>
                        {m.badge && (
                          <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                            {m.badge}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted">
                        {m.description}
                      </span>
                    </span>
                    {active && (
                      <Check className="mt-1 h-4 w-4 shrink-0 text-primary" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
