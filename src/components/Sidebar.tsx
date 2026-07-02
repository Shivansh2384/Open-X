"use client";

import {
  MessageSquare,
  PanelLeftClose,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { Chat } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";

interface SidebarProps {
  chats: Chat[];
  activeId: string | null;
  isMobile: boolean;
  collapsed: boolean;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onClearAll: () => void;
  onCloseMobile: () => void;
  onCollapse: () => void;
}

function ChatItem({
  chat,
  active,
  onSelect,
  onDelete,
  onRename,
}: {
  chat: Chat;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(chat.title);

  function commit() {
    const next = value.trim();
    onRename(next || chat.title);
    setEditing(false);
  }

  if (editing) {
    return (
      <li>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setValue(chat.title);
              setEditing(false);
            }
          }}
          className="w-full rounded-lg border border-primary/50 bg-surface px-3 py-2 text-sm text-foreground outline-none"
        />
      </li>
    );
  }

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => e.key === "Enter" && onSelect()}
        onDoubleClick={() => {
          setValue(chat.title);
          setEditing(true);
        }}
        title={chat.title}
        className={cn(
          "group flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-colors",
          active
            ? "bg-primary/12 text-foreground"
            : "text-muted hover:bg-surface-2 hover:text-foreground",
        )}
      >
        <MessageSquare
          className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "")}
        />
        <span className="flex-1 truncate">{chat.title}</span>
        <button
          type="button"
          aria-label="Delete chat"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted opacity-0 transition-all hover:bg-red-500/15 hover:text-red-500 group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}

export function Sidebar({
  chats,
  activeId,
  isMobile,
  collapsed: _collapsed,
  onNew,
  onSelect,
  onDelete,
  onRename,
  onClearAll,
  onCloseMobile,
  onCollapse,
}: SidebarProps) {
  const [query, setQuery] = useState("");

  const sorted = useMemo(
    () => [...chats].sort((a, b) => b.updatedAt - a.updatedAt),
    [chats],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.messages.some((m) => m.content.toLowerCase().includes(q)),
    );
  }, [sorted, query]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3">
        <Logo size={32} withText />
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={isMobile ? onCloseMobile : onCollapse}
            aria-label="Collapse sidebar"
            className="grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            {isMobile ? <X className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* New chat */}
      <div className="px-3">
        <button
          type="button"
          onClick={onNew}
          className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-transform hover:scale-[1.01] active:scale-[0.99]"
          style={{
            backgroundImage:
              "linear-gradient(135deg, var(--primary), var(--primary-2))",
          }}
        >
          <Plus className="h-4 w-4" />
          New Chat
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pt-3">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
          <Search className="h-4 w-4 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats…"
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted outline-none"
          />
        </div>
      </div>

      {/* Chat list */}
      <div className="mt-3 flex-1 overflow-y-auto px-3 pb-2">
        <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
          History
        </p>
        {filtered.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-muted">
            {chats.length === 0 ? (
              <>
                <Sparkles className="mx-auto mb-2 h-5 w-5 text-primary/60" />
                No chats yet.
                <br />
                Start a new conversation!
              </>
            ) : (
              "No chats match your search."
            )}
          </div>
        ) : (
          <ul className="space-y-0.5">
            {filtered.map((chat) => (
              <ChatItem
                key={chat.id}
                chat={chat}
                active={chat.id === activeId}
                onSelect={() => onSelect(chat.id)}
                onDelete={() => onDelete(chat.id)}
                onRename={(title) => onRename(chat.id, title)}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border px-4 py-3">
        {chats.length > 0 && (
          <button
            type="button"
            onClick={onClearAll}
            className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted transition-colors hover:text-red-500 hover:border-red-500/40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear all conversations
          </button>
        )}
        <p className="text-center text-xs leading-relaxed text-muted">
          <span className="brand-gradient-text font-semibold">OpenX</span>
          <br />
          <span className="text-foreground/80">Made by Shivansh Rai</span>
          <br />
          <span>© {new Date().getFullYear()} OpenX. All rights reserved.</span>
        </p>
      </div>
    </div>
  );
}
