// localStorage-backed persistence for OpenX.
// All chat history lives in the browser only — there is no backend database.

import type { Chat } from "./types";

const CHATS_KEY = "openx.chats.v1";
const ACTIVE_KEY = "openx.activeChatId.v1";
const THEME_KEY = "openx.theme.v1";
const MODEL_KEY = "openx.model.v1";
const SIDEBAR_KEY = "openx.sidebarCollapsed.v1";
const DRAFTS_KEY = "openx.drafts.v1";

const isBrowser = () => typeof window !== "undefined";

function read<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage might be full or blocked — fail silently */
  }
}

export const storage = {
  loadChats: (): Chat[] => read<Chat[]>(CHATS_KEY, []),
  saveChats: (chats: Chat[]) => write(CHATS_KEY, chats),

  loadActiveId: (): string | null => read<string | null>(ACTIVE_KEY, null),
  saveActiveId: (id: string | null) => write(ACTIVE_KEY, id),

  loadTheme: (): "dark" | "light" =>
    read<"dark" | "light">(THEME_KEY, "dark"),
  saveTheme: (t: "dark" | "light") => write(THEME_KEY, t),

  loadModel: (): string | null => read<string | null>(MODEL_KEY, null),
  saveModel: (m: string) => write(MODEL_KEY, m),

  loadSidebarCollapsed: (): boolean => read<boolean>(SIDEBAR_KEY, false),
  saveSidebarCollapsed: (v: boolean) => write(SIDEBAR_KEY, v),

  // ── Per-chat drafts ─────────────────────────────────────────────────────
  // Stores a map of chatId → draft text. The key "__new__" holds the draft
  // for the new-chat screen (no active chat yet).

  loadDrafts: (): Record<string, string> =>
    read<Record<string, string>>(DRAFTS_KEY, {}),

  saveDraft: (chatId: string | null, text: string) => {
    const key = chatId ?? "__new__";
    const drafts = read<Record<string, string>>(DRAFTS_KEY, {});
    if (text.trim()) {
      drafts[key] = text;
    } else {
      delete drafts[key];
    }
    write(DRAFTS_KEY, drafts);
  },

  getDraft: (chatId: string | null): string => {
    const key = chatId ?? "__new__";
    const drafts = read<Record<string, string>>(DRAFTS_KEY, {});
    return drafts[key] ?? "";
  },

  deleteDraft: (chatId: string | null) => {
    const key = chatId ?? "__new__";
    const drafts = read<Record<string, string>>(DRAFTS_KEY, {});
    delete drafts[key];
    write(DRAFTS_KEY, drafts);
  },
};
