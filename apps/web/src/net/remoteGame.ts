import { DEFAULT_RULES, type Move, type PublicView } from '@tenfold/engine';
import type { GameClient, SendError } from '../game/client.ts';
import { callGame } from './api.ts';
import { watchRoom, type RoomSnapshot } from './room.ts';

const toView = (snapshot: RoomSnapshot, playerId: string): PublicView | null =>
  snapshot.data.table
    ? { ...snapshot.data.table, viewerId: playerId, hand: snapshot.cards ?? [] }
    : null;

/** A game played through the Supabase referee. The UI sees exactly what the local game gives it. */
export const createRemoteGame = (
  roomId: string,
  playerId: string,
  initial: RoomSnapshot,
): GameClient | null => {
  let view = toView(initial, playerId);
  if (!view) return null;
  const names = Object.fromEntries(initial.data.players.map((p) => [p.id, p.name]));
  names[playerId] = 'You';
  const listeners = new Set<() => void>();
  const watch = watchRoom(roomId, (snapshot) => {
    const next = toView(snapshot, playerId);
    if (!next) return;
    view = next;
    for (const listener of listeners) listener();
  });
  watch.push(initial);

  return {
    config: DEFAULT_RULES,
    myId: playerId,
    names,
    getView: () => view as PublicView,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    send: async (move: Move): Promise<SendError | null> => {
      const result = await callGame({ type: 'move', roomId, move });
      if (result.ok) {
        watch.push(result.snapshot);
        return null;
      }
      return result.error.code === 'move-rejected' ? result.error.error : { code: 'offline' };
    },
    nextHand: () => {
      void callGame({ type: 'next-hand', roomId }).then((result) => {
        if (result.ok) watch.push(result.snapshot);
        else watch.refresh();
      });
    },
    dispose: () => {
      watch.stop();
      listeners.clear();
    },
  };
};
