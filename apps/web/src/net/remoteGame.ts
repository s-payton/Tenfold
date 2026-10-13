import { DEFAULT_RULES, predictView, type Move, type PublicView } from '@tenfold/engine';
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
  const first = toView(initial, playerId);
  if (!first) return null;
  /** The last view the server confirmed. */
  let confirmed: PublicView = first;
  /** What the screen shows: `confirmed`, or a prediction while a move is in flight. */
  let shown: PublicView = first;
  const names = Object.fromEntries(initial.data.players.map((p) => [p.id, p.name]));
  names[playerId] = 'You';
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  let inFlight = 0;
  const watch = watchRoom(
    roomId,
    (snapshot) => {
      const next = toView(snapshot, playerId);
      if (!next) return;
      confirmed = next;
      shown = next;
      notify();
    },
    () => inFlight > 0,
  );
  watch.push(initial);

  // Moves go to the server one at a time, in the order they were made.
  let queue: Promise<unknown> = Promise.resolve();

  const send = async (move: Move): Promise<SendError | null> => {
    // Show the result now when it can be worked out without secret cards.
    const guess = predictView(shown, move, DEFAULT_RULES);
    if (guess) {
      shown = guess;
      notify();
    }
    inFlight += 1;
    const request = queue.then(() => callGame({ type: 'move', roomId, move }));
    queue = request.catch(() => undefined);
    const result = await request.finally(() => {
      inFlight -= 1;
    });
    if (result.ok) {
      watch.push(result.snapshot);
      return null;
    }
    if (guess) {
      shown = confirmed;
      notify();
    }
    watch.refresh();
    return result.error.code === 'move-rejected' ? result.error.error : { code: 'offline' };
  };

  return {
    config: DEFAULT_RULES,
    myId: playerId,
    names,
    getView: () => shown,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    send,
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
