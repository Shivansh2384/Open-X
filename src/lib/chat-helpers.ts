// Pure, client-safe helpers for manipulating the local chat list.

import type { ApiMessage, Chat, Message } from "./types";
import { DEFAULT_MODEL_ID } from "./types";
import { deriveTitle, uid } from "./utils";

export function makeChat(modelId: string, firstText: string): Chat {
  const now = Date.now();
  return {
    id: uid(),
    title: deriveTitle(firstText),
    model: modelId || DEFAULT_MODEL_ID,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function appendMessage(
  chats: Chat[],
  chatId: string,
  message: Message,
): Chat[] {
  return chats.map((c) =>
    c.id === chatId
      ? {
          ...c,
          messages: [...c.messages, message],
          updatedAt: message.createdAt ?? Date.now(),
        }
      : c,
  );
}

export function patchMessage(
  chats: Chat[],
  chatId: string,
  messageId: string,
  patch: Partial<Message>,
): Chat[] {
  return chats.map((c) =>
    c.id === chatId
      ? {
          ...c,
          updatedAt: Date.now(),
          messages: c.messages.map((m) =>
            m.id === messageId ? { ...m, ...patch } : m,
          ),
        }
      : c,
  );
}

export function setChatModel(
  chats: Chat[],
  chatId: string | null,
  modelId: string,
): Chat[] {
  if (!chatId) return chats;
  return chats.map((c) => (c.id === chatId ? { ...c, model: modelId } : c));
}

export function deleteChat(chats: Chat[], chatId: string): Chat[] {
  return chats.filter((c) => c.id !== chatId);
}

/** Convert stored messages into the wire format sent to /api/chat. */
export function toApiMessages(messages: Message[]): ApiMessage[] {
  const out: ApiMessage[] = [];
  for (const m of messages) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    if (m.error) continue;
    const content = m.content.trim();
    if (!content) continue;
    out.push({ role: m.role, content: m.content });
  }
  return out;
}
