import { useState } from 'react';
import type { Throwable } from '@tenfold/server';
import type { ChatEntry } from './client.ts';

/** Something to animate on the table: a speech bubble, or an egg or pie in flight. */
export type ChatEffect =
  | {
      readonly key: number;
      readonly kind: 'say';
      readonly playerId: string;
      readonly text: string;
      /** A lone emoji reaction, drawn large. */
      readonly big: boolean;
    }
  | {
      readonly key: number;
      readonly kind: 'throw';
      readonly from: string;
      readonly to: string;
      readonly item: Throwable;
    };

/** Long messages are cut short in the bubble; the chat panel has the full text. */
const BUBBLE_CHARS = 60;

const clip = (text: string): string => {
  const chars = Array.from(text);
  return chars.length > BUBBLE_CHARS ? `${chars.slice(0, BUBBLE_CHARS - 3).join('')}...` : text;
};

const toEffect = (m: ChatEntry): ChatEffect => {
  switch (m.body.kind) {
    case 'text':
      return { key: m.id, kind: 'say', playerId: m.playerId, text: clip(m.body.text), big: false };
    case 'emoji':
      return { key: m.id, kind: 'say', playerId: m.playerId, text: m.body.emoji, big: true };
    case 'throw':
      return { key: m.id, kind: 'throw', from: m.playerId, to: m.body.targetId, item: m.body.item };
  }
};

/**
 * Turns live messages into effects, each shown once. An effect stays until its component
 * calls `done`, which it does when its animation ends.
 */
export const useChatEffects = (messages: readonly ChatEntry[]) => {
  const [seenUpTo, setSeenUpTo] = useState(() => messages.at(-1)?.id ?? 0);
  const [effects, setEffects] = useState<readonly ChatEffect[]>([]);

  const fresh = messages.filter((m) => m.live && m.id > seenUpTo);
  if (fresh.length > 0) {
    setSeenUpTo(Math.max(...fresh.map((m) => m.id)));
    setEffects([...effects, ...fresh.map(toEffect)]);
  }

  const done = (key: number) => setEffects((list) => list.filter((e) => e.key !== key));
  return { effects, done };
};
