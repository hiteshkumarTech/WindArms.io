'use client';

import { useEffect, useReducer, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { getSocket } from '@/lib/network/socket';
import { useChatStore } from '@/stores/chatStore';
import { useMultiplayerStore } from '@/stores/multiplayerStore';

const FADE_AFTER_MS = 6000;
const MAX_LENGTH = 120;

/**
 * In-match text chat (online sessions). Enter or T opens the input while
 * the pointer stays locked; Enter sends and returns control to the game.
 * While open, `chatStore.open` tells every input system to stand down.
 */
export default function ChatPanel() {
  const open = useChatStore((state) => state.open);
  const messages = useChatStore((state) => state.messages);
  const online = useMultiplayerStore((state) => state.mode === 'online');
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [, forceRender] = useReducer((tick: number) => tick + 1, 0);

  // Fade timer for recent messages.
  useEffect(() => {
    const interval = window.setInterval(forceRender, 1000);
    return () => window.clearInterval(interval);
  }, []);

  // Open bindings (Enter / T while locked) + close when the lock drops.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const chat = useChatStore.getState();
      if (chat.open) return; // the input's own handler takes over
      if (!document.pointerLockElement) return;
      if (useMultiplayerStore.getState().mode !== 'online') return;
      if (event.code === 'Enter' || event.code === 'KeyT') {
        event.preventDefault();
        chat.setOpen(true);
      }
    };
    const onLockChange = () => {
      if (document.pointerLockElement === null) {
        useChatStore.getState().setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerlockchange', onLockChange);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerlockchange', onLockChange);
    };
  }, []);

  // Focus the input on open.
  useEffect(() => {
    if (!open) return;
    setDraft('');
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  if (!online) return null;

  const send = () => {
    const text = draft.trim().slice(0, MAX_LENGTH);
    if (text.length > 0) {
      const socket = getSocket();
      if (socket.connected) socket.emit('chat:send', text);
    }
    setDraft('');
    useChatStore.getState().setOpen(false);
  };

  const now = Date.now();
  const visibleMessages = open
    ? messages.slice(-8)
    : messages.slice(-6).filter((message) => now - message.at < FADE_AFTER_MS);

  return (
    <div className="pointer-events-none absolute bottom-[13.5rem] left-5 z-20 w-80">
      <div className="flex flex-col gap-1">
        {visibleMessages.map((message) => (
          <div
            key={message.id}
            className="rounded-lg bg-black/45 px-2.5 py-1 text-xs leading-relaxed backdrop-blur-sm"
          >
            <span className={cn('font-semibold', message.self ? 'text-neon-cyan' : 'text-white/85')}>
              {message.senderName}
            </span>
            <span className="text-white/70">: {message.text}</span>
          </div>
        ))}
      </div>

      {open ? (
        <input
          ref={inputRef}
          type="text"
          value={draft}
          maxLength={MAX_LENGTH}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Enter') send();
          }}
          placeholder="Message — Enter to send"
          className="pointer-events-auto mt-2 h-9 w-full rounded-lg border border-neon-cyan/40 bg-black/60 px-3 text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-neon-cyan/40"
        />
      ) : (
        <p className="mt-1 text-[10px] uppercase tracking-widest text-white/25">Enter to chat</p>
      )}
    </div>
  );
}
