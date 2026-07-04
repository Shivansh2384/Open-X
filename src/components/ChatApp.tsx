"use client";

import { PanelLeft } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChatError, streamChat } from "@/lib/chat-client";
import {
  appendMessage,
  deleteChat,
  makeChat,
  patchMessage,
  setChatModel,
  toApiMessages,
} from "@/lib/chat-helpers";
import { storage } from "@/lib/storage";
import { DEFAULT_MODEL_ID, type Chat, type Message, type PublicModel } from "@/lib/types";
import { cn, uid } from "@/lib/utils";
import { useConnectionStatus } from "@/hooks/useConnectionStatus";
import { useIsMobile } from "@/hooks/useIsMobile";
import { ChatInput } from "./ChatInput";
import { EmptyState } from "./EmptyState";
import { MessageBubble } from "./MessageBubble";
import { ModelSelector } from "./ModelSelector";
import { Sidebar } from "./Sidebar";
import { ThemeToggle } from "./ThemeToggle";

/** Detect image generation requests */
function isImageRequest(text: string): boolean {
  const q = text.toLowerCase();
  const patterns = [
    /^generate\s+(an?\s+)?image\s+(of|showing|with)/i,
    /^create\s+(an?\s+)?image\s+(of|showing|with)/i,
    /^draw\s+(an?\s+)?/i,
    /^make\s+(an?\s+)?image\s+(of|showing|with)/i,
    /^imagine\s+/i,
    /^picture\s+(of|showing)/i,
    /^visualize\s+/i,
    /^render\s+(an?\s+)?/i,
  ];
  return patterns.some((p) => p.test(q));
}

/** Extract the image prompt from user input */
function extractImagePrompt(text: string): string {
  // Remove common prefixes
  return text
    .replace(/^(generate|create|draw|make|imagine|picture|visualize|render)\s+(an?\s+)?(image\s+)?(of\s+|showing\s+|with\s+)?/i, "")
    .trim();
}

export function ChatApp() {
  const isMobile = useIsMobile();
  const connStatus = useConnectionStatus();

  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [models, setModels] = useState<PublicModel[]>([
    {
      id: DEFAULT_MODEL_ID,
      label: "ShivanshAI-1.1",
      description: "Powerful, reasoning-enabled & unlimited",
      badge: "Default",
    },
  ]);
  const [modelId, setModelId] = useState<string>(DEFAULT_MODEL_ID);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [webSearch, setWebSearch] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  const activeChat = chats.find((c) => c.id === activeId) ?? null;
  const messages = activeChat?.messages ?? [];

  // ── Mount: hydrate from localStorage + fetch model list ─────────────────
  useEffect(() => {
    const loaded = storage.loadChats();
    setChats(loaded);
    const savedActiveId = storage.loadActiveId();
    setActiveId(savedActiveId);
    setModelId(storage.loadModel() ?? DEFAULT_MODEL_ID);
    setTheme(storage.loadTheme());
    setCollapsed(storage.loadSidebarCollapsed());
    // Restore any saved draft for the active chat
    setInput(storage.getDraft(savedActiveId));

    let active = true;
    fetch("/api/models")
      .then((r) => r.json())
      .then((d: { models?: PublicModel[] }) => {
        if (active && Array.isArray(d.models) && d.models.length) {
          setModels(d.models);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Persist
  useEffect(() => storage.saveChats(chats), [chats]);
  useEffect(() => storage.saveActiveId(activeId), [activeId]);
  useEffect(() => storage.saveModel(modelId), [modelId]);
  useEffect(() => storage.saveSidebarCollapsed(collapsed), [collapsed]);

  // Auto-save draft whenever input changes
  useEffect(() => {
    storage.saveDraft(activeId, input);
  }, [input, activeId]);

  // Apply theme to <html>
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    storage.saveTheme(theme);
  }, [theme]);

  // Auto-scroll while sticking to the bottom
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickRef.current = distance < 120;
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  // ── Image generation ────────────────────────────────────────────────────
  const generateImage = useCallback(
    async (chatId: string, assistantId: string, prompt: string) => {
      setBusy(true);
      stickRef.current = true;

      setChats((prev) =>
        patchMessage(prev, chatId, assistantId, {
          generatingImage: true,
          pending: true,
        }),
      );

      try {
        const res = await fetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
        });
        const data = await res.json();

        if (data.error) {
          setChats((prev) =>
            patchMessage(prev, chatId, assistantId, {
              content: `⚠️ ${data.error}`,
              generatingImage: false,
              pending: false,
              error: true,
            }),
          );
        } else {
          setChats((prev) =>
            patchMessage(prev, chatId, assistantId, {
              content: `Here's the image I generated for: **"${data.prompt}"**`,
              imageUrl: data.url,
              generatingImage: false,
              pending: false,
              error: false,
            }),
          );
        }
      } catch {
        setChats((prev) =>
          patchMessage(prev, chatId, assistantId, {
            content: "⚠️ Failed to generate image. Please try again.",
            generatingImage: false,
            pending: false,
            error: true,
          }),
        );
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  // ── Streaming core ──────────────────────────────────────────────────────
  const runStream = useCallback(
    async (
      chatId: string,
      assistantId: string,
      apiMessages: Message[],
      useWebSearch: boolean,
    ) => {
      const controller = new AbortController();
      abortRef.current = controller;
      setBusy(true);
      stickRef.current = true;

      let acc = "";
      let reasoningAcc = "";
      let sources: { title: string; url: string; snippet: string }[] | undefined;
      try {
        for await (const delta of streamChat({
          model: modelId,
          messages: toApiMessages(apiMessages),
          webSearch: useWebSearch,
          signal: controller.signal,
        })) {
          if (delta.searching) {
            setChats((prev) =>
              patchMessage(prev, chatId, assistantId, { searching: true, pending: true }),
            );
          }
          if (delta.sources) {
            sources = delta.sources;
            setChats((prev) =>
              patchMessage(prev, chatId, assistantId, { sources, searching: false, pending: true }),
            );
          }
          if (delta.reasoning) {
            reasoningAcc += delta.reasoning;
            setChats((prev) =>
              patchMessage(prev, chatId, assistantId, {
                reasoning: reasoningAcc,
                pending: true,
              }),
            );
          }
          if (delta.token) {
            acc += delta.token;
            setChats((prev) =>
              patchMessage(prev, chatId, assistantId, {
                content: acc,
                pending: true,
              }),
            );
          }
        }
        setChats((prev) =>
          patchMessage(prev, chatId, assistantId, {
            content: acc || "_(no response)_",
            reasoning: reasoningAcc,
            sources,
            searching: false,
            pending: false,
            error: false,
          }),
        );
      } catch (err) {
        if (controller.signal.aborted) {
          setChats((prev) =>
            patchMessage(prev, chatId, assistantId, {
              content: acc,
              reasoning: reasoningAcc,
              sources,
              pending: false,
              error: !acc.trim(),
            }),
          );
        } else {
          const message =
            err instanceof ChatError
              ? err.message
              : "Something went wrong. Please try again.";
          setChats((prev) =>
            patchMessage(prev, chatId, assistantId, {
              content: acc ? `${acc}\n\n⚠️ ${message}` : message,
              reasoning: reasoningAcc,
              sources,
              pending: false,
              error: true,
            }),
          );
        }
      } finally {
        setBusy(false);
        abortRef.current = null;
      }
    },
    [modelId],
  );

  // ── Send ────────────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    (text: string) => {
      const content = text.trim();
      if (!content || busy) return;
      setInput("");
      storage.deleteDraft(activeId);
      setMobileOpen(false);

      const existing = activeId ? chats.find((c) => c.id === activeId) : undefined;
      const now = Date.now();
      const userMsg: Message = {
        id: uid(),
        role: "user",
        content,
        createdAt: now,
      };
      const aiMsg: Message = {
        id: uid(),
        role: "assistant",
        content: "",
        createdAt: now + 1,
        pending: true,
      };

      let chatId: string;
      let fresh: Chat | null = null;
      if (existing) {
        chatId = existing.id;
      } else {
        fresh = makeChat(modelId, content);
        chatId = fresh.id;
      }

      setChats((prev) => {
        let working = prev;
        if (fresh) {
          working = [fresh, ...working];
        }
        working = appendMessage(working, chatId, userMsg);
        working = appendMessage(working, chatId, aiMsg);
        return working;
      });

      if (fresh) setActiveId(chatId);

      // Check if this is an image generation request
      if (isImageRequest(content)) {
        const imagePrompt = extractImagePrompt(content);
        void generateImage(chatId, aiMsg.id, imagePrompt || content);
      } else {
        const base = existing ? existing.messages : [];
        void runStream(chatId, aiMsg.id, [...base, userMsg], webSearch);
      }
    },
    [activeId, busy, chats, modelId, runStream, webSearch, generateImage],
  );

  // ── Edit message ────────────────────────────────────────────────────────
  const editMessage = useCallback(
    (messageId: string, newContent: string) => {
      if (busy || !activeChat) return;

      // Find the message index
      const msgIndex = activeChat.messages.findIndex((m) => m.id === messageId);
      if (msgIndex === -1) return;

      // Keep messages up to (but not including) the edited message
      const before = activeChat.messages.slice(0, msgIndex);
      
      // Create new user message with updated content
      const now = Date.now();
      const userMsg: Message = {
        id: uid(),
        role: "user",
        content: newContent,
        createdAt: now,
      };
      const aiMsg: Message = {
        id: uid(),
        role: "assistant",
        content: "",
        createdAt: now + 1,
        pending: true,
      };

      // Update chat with truncated history + new messages
      setChats((prev) =>
        prev.map((c) =>
          c.id === activeChat.id
            ? {
                ...c,
                messages: [...before, userMsg, aiMsg],
                updatedAt: now,
              }
            : c,
        ),
      );

      // Check if this is an image generation request
      if (isImageRequest(newContent)) {
        const imagePrompt = extractImagePrompt(newContent);
        void generateImage(activeChat.id, aiMsg.id, imagePrompt || newContent);
      } else {
        void runStream(activeChat.id, aiMsg.id, [...before, userMsg], webSearch);
      }
    },
    [activeChat, busy, runStream, webSearch, generateImage],
  );

  // ── Regenerate ──────────────────────────────────────────────────────────
  const regenerate = useCallback(() => {
    if (busy || !activeChat) return;
    const msgs = activeChat.messages;
    let lastAi = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === "assistant") {
        lastAi = i;
        break;
      }
    }
    if (lastAi === -1) return;
    const before = msgs.slice(0, lastAi);
    const apiMessages = toApiMessages(before);
    if (apiMessages.length === 0) return;

    const assistantId = msgs[lastAi].id;
    setChats((prev) =>
      patchMessage(prev, activeChat.id, assistantId, {
        content: "",
        imageUrl: undefined,
        sources: undefined,
        searching: false,
        generatingImage: false,
        pending: true,
        error: false,
      }),
    );

    // Check if the last user message was an image request
    const lastUserMsg = [...before].reverse().find((m) => m.role === "user");
    if (lastUserMsg && isImageRequest(lastUserMsg.content)) {
      const imagePrompt = extractImagePrompt(lastUserMsg.content);
      void generateImage(activeChat.id, assistantId, imagePrompt || lastUserMsg.content);
    } else {
      void runStream(activeChat.id, assistantId, before, webSearch);
    }
  }, [activeChat, busy, runStream, webSearch, generateImage]);

  // ── Controls ────────────────────────────────────────────────────────────
  const stop = useCallback(() => abortRef.current?.abort(), []);

  const newChat = useCallback(() => {
    stop();
    setActiveId(null);
    setInput(storage.getDraft(null));
    setMobileOpen(false);
  }, [stop]);

  const selectChat = useCallback((id: string) => {
    setActiveId(id);
    setInput(storage.getDraft(id));
    setMobileOpen(false);
    stickRef.current = true;
  }, []);

  const removeChat = useCallback(
    (id: string) => {
      setChats((prev) => deleteChat(prev, id));
      storage.deleteDraft(id);
      setActiveId((cur) => {
        if (cur === id) {
          setInput(storage.getDraft(null));
          return null;
        }
        return cur;
      });
    },
    [],
  );

  const renameChat = useCallback((id: string, title: string) => {
    setChats((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title } : c)),
    );
  }, []);

  const clearAll = useCallback(() => {
    if (chats.length === 0) return;
    if (
      window.confirm("Delete all conversations? This cannot be undone.")
    ) {
      stop();
      setChats([]);
      setActiveId(null);
    }
  }, [chats.length, stop]);

  const changeModel = useCallback(
    (id: string) => {
      setModelId(id);
      setChats((prev) => setChatModel(prev, activeId, id));
    },
    [activeId],
  );

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  const handleOpenSidebar = useCallback(() => {
    if (isMobile) setMobileOpen(true);
    else setCollapsed(false);
  }, [isMobile]);

  const selectedLabel =
    models.find((m) => m.id === modelId)?.label ?? "ShivanshAI-1.1";

  // Last assistant message id (for action visibility / regenerate)
  let lastAssistantId: string | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") {
      lastAssistantId = messages[i].id;
      break;
    }
  }

  return (
    <div className="app-glow relative flex h-[100dvh] w-full overflow-hidden">
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "glass fixed inset-y-0 left-0 z-50 flex w-[290px] shrink-0 flex-col border-r border-border transition-transform duration-300 ease-out md:relative md:z-auto",
          collapsed ? "md:hidden" : "md:flex",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
        <Sidebar
          chats={chats}
          activeId={activeId}
          isMobile={isMobile}
          collapsed={collapsed}
          onNew={newChat}
          onSelect={selectChat}
          onDelete={removeChat}
          onRename={renameChat}
          onClearAll={clearAll}
          onCloseMobile={() => setMobileOpen(false)}
          onCollapse={() => setCollapsed(true)}
        />
      </aside>

      {/* Main column */}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="glass sticky top-0 z-20 flex items-center gap-2 border-b border-border px-3 py-2.5">
          <button
            type="button"
            onClick={handleOpenSidebar}
            aria-label="Open sidebar"
            className={cn(
              "grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border bg-surface text-muted transition-colors hover:text-foreground hover:border-border-strong",
              collapsed ? "md:inline-grid" : "md:hidden",
            )}
          >
            <PanelLeft className="h-[18px] w-[18px]" />
          </button>

          <ModelSelector
            models={models}
            selectedId={modelId}
            onSelect={changeModel}
            className="shrink-0"
          />

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <span
              title={
                connStatus === "demo"
                  ? "API key not loaded — running in demo mode. Check your .env file."
                  : connStatus === "live"
                    ? "Connected to the ShivanshAI engine."
                    : "Checking connection…"
              }
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-medium sm:inline-flex"
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  connStatus === "live" && "bg-emerald-500",
                  connStatus === "demo" && "bg-amber-500 animate-pulse",
                  connStatus === "checking" && "bg-muted",
                )}
              />
              <span
                className={cn(
                  connStatus === "demo"
                    ? "text-amber-500"
                    : "text-muted",
                )}
              >
                {connStatus === "demo"
                  ? "Demo"
                  : connStatus === "live"
                    ? "Live"
                    : "…"}
              </span>
            </span>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
          </div>
        </header>

        {/* Messages */}
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="relative flex-1 overflow-y-auto"
        >
          {messages.length > 0 ? (
            <div className="mx-auto w-full max-w-3xl space-y-7 px-4 py-6 sm:px-6">
              {messages.map((m) => {
                const isLastAi = m.id === lastAssistantId;
                return (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    isLastAssistant={isLastAi}
                    canRegenerate={isLastAi && !busy}
                    busy={busy}
                    onRegenerate={regenerate}
                    onEditMessage={m.role === "user" ? editMessage : undefined}
                  />
                );
              })}
            </div>
          ) : (
            <EmptyState modelName={selectedLabel} onPick={(p) => sendMessage(p)} />
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-border bg-background/70 px-4 py-3 backdrop-blur">
          <ChatInput
            value={input}
            onChange={setInput}
            onSend={() => sendMessage(input)}
            onStop={stop}
            busy={busy}
            webSearch={webSearch}
            onToggleWebSearch={() => setWebSearch((v) => !v)}
          />
        </div>
      </div>
    </div>
  );
}
