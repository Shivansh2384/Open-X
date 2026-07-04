"use client";

import {
  AlertTriangle,
  Brain,
  Check,
  ChevronDown,
  Download,
  ExternalLink,
  Globe,
  ImageIcon,
  Pencil,
  RefreshCw,
  User,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { Message } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CopyButton } from "./CopyButton";
import { Logo } from "./Logo";
import { Markdown } from "./Markdown";

interface MessageBubbleProps {
  message: Message;
  isLastAssistant: boolean;
  canRegenerate: boolean;
  busy: boolean;
  onRegenerate: () => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
}

export function MessageBubble({
  message,
  isLastAssistant,
  canRegenerate,
  busy,
  onRegenerate,
  onEditMessage,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const streaming = !!message.pending && !isUser;

  if (isUser) {
    return (
      <UserBubble
        message={message}
        busy={busy}
        onEdit={onEditMessage}
      />
    );
  }

  // Assistant
  return (
    <div className="group flex animate-slide-up gap-3">
      <Logo size={32} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">ShivanshAI</span>
          {streaming && message.content && (
            <span className="text-[11px] font-medium text-primary">typing…</span>
          )}
        </div>

        {message.reasoning && (
          <ThinkingPanel
            reasoning={message.reasoning}
            active={streaming && !message.content}
          />
        )}

        {/* Live web-search indicator */}
        {message.searching && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-medium text-primary">
            <Globe className="h-3.5 w-3.5 animate-pulse" />
            Searching the web for real-time info…
          </div>
        )}

        {/* Image generation indicator */}
        {message.generatingImage && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-medium text-primary">
            <ImageIcon className="h-3.5 w-3.5 animate-pulse" />
            Generating image…
          </div>
        )}

        {/* Web search sources */}
        {message.sources && message.sources.length > 0 && (
          <SourcesPanel sources={message.sources} />
        )}

        {/* Generated image */}
        {message.imageUrl && (
          <GeneratedImage url={message.imageUrl} />
        )}

        {message.content ? (
          <Markdown
            content={message.content}
            className={cn(streaming && "typer-caret")}
          />
        ) : !message.reasoning && !message.searching && !message.generatingImage && streaming ? (
          <ThinkingDots />
        ) : null}

        {message.error && (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="flex-1">{message.content || "Something went wrong."}</span>
          </div>
        )}

        {/* Actions */}
        {!streaming && message.content && !message.error && (
          <div
            className={cn(
              "mt-2 flex items-center gap-1 transition-opacity",
              isLastAssistant ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
          >
            <CopyButton text={message.content} />
            {canRegenerate && (
              <button
                type="button"
                onClick={onRegenerate}
                disabled={busy}
                title="Regenerate response"
                aria-label="Regenerate response"
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-40"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Regenerate
              </button>
            )}
          </div>
        )}

        {message.error && canRegenerate && (
          <button
            type="button"
            onClick={onRegenerate}
            disabled={busy}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-border-strong disabled:opacity-40"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

/** User message bubble with edit functionality */
function UserBubble({
  message,
  busy,
  onEdit,
}: {
  message: Message;
  busy: boolean;
  onEdit?: (messageId: string, newContent: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.content);

  function startEdit() {
    if (busy) return;
    setEditValue(message.content);
    setEditing(true);
  }

  function cancelEdit() {
    setEditValue(message.content);
    setEditing(false);
  }

  function saveEdit() {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== message.content && onEdit) {
      onEdit(message.id, trimmed);
    }
    setEditing(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      saveEdit();
    }
    if (e.key === "Escape") {
      cancelEdit();
    }
  }

  if (editing) {
    return (
      <div className="flex animate-slide-up justify-end gap-3">
        <div className="w-full max-w-[85%]">
          <textarea
            autoFocus
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={onKeyDown}
            rows={3}
            className="w-full rounded-2xl border border-primary/50 bg-surface px-4 py-2.5 text-[0.95rem] leading-relaxed text-foreground outline-none resize-none"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={cancelEdit}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </button>
            <button
              type="button"
              onClick={saveEdit}
              disabled={!editValue.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
            >
              <Check className="h-3.5 w-3.5" />
              Save & Send
            </button>
          </div>
        </div>
        <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border bg-surface text-muted">
          <User className="h-4 w-4" />
        </div>
      </div>
    );
  }

  return (
    <div className="group flex animate-slide-up justify-end gap-3">
      <div className="relative max-w-[85%]">
        <div className="rounded-2xl rounded-tr-md bg-user-bubble px-4 py-2.5 text-[0.95rem] leading-relaxed text-foreground whitespace-pre-wrap break-words">
          {message.content}
        </div>
        {/* Edit button - shows on hover */}
        {onEdit && !busy && (
          <button
            type="button"
            onClick={startEdit}
            title="Edit message"
            className="absolute -left-8 top-1/2 -translate-y-1/2 grid h-6 w-6 place-items-center rounded-md text-muted opacity-0 transition-all hover:bg-surface-2 hover:text-foreground group-hover:opacity-100"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border bg-surface text-muted">
        <User className="h-4 w-4" />
      </div>
    </div>
  );
}

/** Display a generated image with download option */
function GeneratedImage({ url }: { url: string }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [retries, setRetries] = useState(0);

  // The server pre-fetches the image so it should be cached, but add
  // a cache-busting retry mechanism just in case.
  const imgSrc = retries > 0 ? `${url}&_r=${retries}` : url;

  function handleError() {
    if (retries < 2) {
      // Retry after a short delay
      setTimeout(() => setRetries((r) => r + 1), 2000);
    } else {
      setError(true);
    }
  }

  async function download() {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `openx-image-${Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(url, "_blank");
    }
  }

  if (error) {
    return (
      <div className="mb-3 overflow-hidden rounded-xl border border-border">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-48 flex-col items-center justify-center gap-2 bg-surface-2 text-sm text-muted transition-colors hover:bg-surface-2/80"
        >
          <ImageIcon className="h-8 w-8 text-primary/60" />
          <span>Click to view image in a new tab</span>
        </a>
      </div>
    );
  }

  return (
    <div className="mb-3 overflow-hidden rounded-xl border border-border">
      {!loaded && (
        <div className="flex h-64 items-center justify-center bg-surface-2">
          <div className="flex items-center gap-2 text-sm text-muted">
            <ImageIcon className="h-5 w-5 animate-pulse" />
            Loading image…
          </div>
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imgSrc}
        alt="Generated image"
        crossOrigin="anonymous"
        className={cn(
          "w-full max-w-lg transition-opacity",
          loaded ? "opacity-100" : "opacity-0 h-0"
        )}
        onLoad={() => setLoaded(true)}
        onError={handleError}
      />
      {loaded && (
        <div className="flex items-center justify-between border-t border-border bg-surface-2/50 px-3 py-2">
          <span className="text-xs text-muted">AI Generated Image</span>
          <button
            type="button"
            onClick={download}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface hover:text-foreground"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </button>
        </div>
      )}
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1.5 py-2">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 rounded-full bg-primary"
          style={{
            animation: "bounce-dot 1.2s infinite",
            animationDelay: `${i * 0.16}s`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * Shows the web sources used to answer, as clickable links. Collapsible.
 */
function SourcesPanel({
  sources,
}: {
  sources: { title: string; url: string; snippet: string }[];
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <Globe className="h-3.5 w-3.5 text-primary" />
        <span>{sources.length} web source{sources.length > 1 ? "s" : ""}</span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="mt-1.5 space-y-1.5">
          {sources.map((s, i) => (
            <a
              key={i}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-2 rounded-lg border border-border bg-surface-2/50 px-3 py-2 transition-colors hover:border-border-strong hover:bg-surface-2"
            >
              <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded text-[10px] font-bold text-primary">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 text-xs font-semibold text-foreground">
                  <span className="truncate">{s.title}</span>
                  <ExternalLink className="h-3 w-3 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
                </span>
                {s.snippet && (
                  <span className="mt-0.5 block truncate text-[11px] text-muted">
                    {s.snippet}
                  </span>
                )}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Collapsible panel that shows the model's chain-of-thought reasoning.
 * Auto-expands while reasoning is actively streaming, then collapses once the
 * final answer begins — but stays click-to-expand afterward.
 */
function ThinkingPanel({
  reasoning,
  active,
}: {
  reasoning: string;
  active: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(active);
  }, [active]);

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        {active ? (
          <>
            <Brain className="h-3.5 w-3.5 animate-pulse text-primary" />
            <span className="text-primary">Thinking…</span>
          </>
        ) : (
          <>
            <Brain className="h-3.5 w-3.5" />
            <span>Thought process</span>
          </>
        )}
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && reasoning && (
        <div className="mt-1.5 max-h-72 overflow-y-auto rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-[0.85rem] leading-relaxed text-muted whitespace-pre-wrap">
          {reasoning}
        </div>
      )}
    </div>
  );
}
