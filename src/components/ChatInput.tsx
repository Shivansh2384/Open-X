"use client";

import { ArrowUp, Globe, Square } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  busy: boolean;
  webSearch: boolean;
  onToggleWebSearch: () => void;
  placeholder?: string;
}

export function ChatInput({
  value,
  onChange,
  onSend,
  onStop,
  busy,
  webSearch,
  onToggleWebSearch,
  placeholder = "Message OpenX…",
}: ChatInputProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-resize to fit content (capped at a max height).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!busy) onSend();
    }
  }

  const canSend = value.trim().length > 0 && !busy;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="flex items-end gap-2 rounded-2xl border border-border bg-surface p-2 shadow-lg shadow-black/5 transition-colors focus-within:border-border-strong">
        <button
          type="button"
          onClick={onToggleWebSearch}
          aria-pressed={webSearch}
          title={webSearch ? "Web search is ON" : "Search the web for real-time info"}
          className={cn(
            "flex shrink-0 items-center gap-1.5 self-center rounded-xl px-2.5 py-2 text-xs font-medium transition-colors",
            webSearch
              ? "bg-primary/15 text-primary"
              : "text-muted hover:bg-surface-2 hover:text-foreground",
          )}
        >
          <Globe className="h-[18px] w-[18px]" />
          <span className="hidden sm:inline">Search</span>
        </button>
        <textarea
          ref={ref}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={webSearch ? "Ask anything — I'll search the web live…" : placeholder}
          className="max-h-[200px] flex-1 resize-none bg-transparent px-2.5 py-2 text-[0.95rem] leading-relaxed text-foreground placeholder:text-muted outline-none"
        />
        {busy ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop generating"
            title="Stop generating"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-foreground transition-colors hover:bg-border-strong"
          >
            <Square className="h-4 w-4 fill-current" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onSend}
            disabled={!canSend}
            aria-label="Send message"
            title="Send message"
            className={cn(
              "grid h-9 w-9 shrink-0 place-items-center rounded-xl text-primary-foreground transition-all",
              canSend
                ? "scale-100 hover:scale-105"
                : "scale-95 cursor-not-allowed opacity-40",
            )}
            style={{
              backgroundImage:
                "linear-gradient(135deg, var(--primary), var(--primary-2))",
            }}
          >
            <ArrowUp className="h-5 w-5" strokeWidth={2.5} />
          </button>
        )}
      </div>
      <p className="mt-2 text-center text-[11px] text-muted">
        OpenX never makes mistakes. Press{" "}
        <kbd className="rounded border border-border bg-surface px-1 py-0.5 font-sans text-[10px]">
          Enter
        </kbd>{" "}
        to send,{" "}
        <kbd className="rounded border border-border bg-surface px-1 py-0.5 font-sans text-[10px]">
          Shift+Enter
        </kbd>{" "}
        for a new line.
      </p>
    </div>
  );
}
