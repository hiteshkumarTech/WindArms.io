'use client';

import { create } from 'zustand';
import type { ChatMessage } from '@shared/protocol';

export interface ChatEntry extends ChatMessage {
  /** True when the local player sent this message. */
  self: boolean;
}

const MESSAGE_LIMIT = 50;

interface ChatStore {
  /** Chat input is open — game input systems must ignore the keyboard. */
  open: boolean;
  messages: ChatEntry[];

  setOpen: (open: boolean) => void;
  add: (message: ChatMessage, selfId: string | null) => void;
  reset: () => void;
}

/**
 * In-match text chat. `open` doubles as the global "keyboard captured by
 * UI" flag: the input hook, weapon system and controller all check it
 * before consuming keys.
 */
export const useChatStore = create<ChatStore>()((set) => ({
  open: false,
  messages: [],

  setOpen: (open) => set({ open }),

  add: (message, selfId) =>
    set((state) => ({
      messages: [
        ...state.messages.slice(-(MESSAGE_LIMIT - 1)),
        { ...message, self: message.senderId === selfId },
      ],
    })),

  reset: () => set({ open: false, messages: [] }),
}));
