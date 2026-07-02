// localStorage-backed persistence for OpenX.
// All chat history lives in the browser only — there is no backend database.

import type { Chat } from "./types";

const CHATS_KEY = "openx.chats.v1";
const ACTIVE_KEY = "openx.activeChatId.v1";
const THEME_KEY = "openx.theme.v1";
const MODEL_KEY = "openx.model.v1";
const SIDEBAR_KEY = "openx.sidebarCollapsed.v1";

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
};
