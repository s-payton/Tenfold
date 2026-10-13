import { predictView, rulesFromHouse, type Move, type PublicView } from '@tenfold/engine';
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
  let roomData = initial.data;
  // Settings are fixed once the game starts.
  const config = rulesFromHouse(initial.data.settings.rules);
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };

  // Every phone in the room watches the turn clock. When it runs out, any of them asks the
  // server to play the turn; the server checks the deadline against its own clock. A small
  // random delay keeps all phones from asking at the same instant.
  let clockTimer: ReturnType<typeof setTimeout> | undefined;
  const askTimeout = () => {
    void callGame({ type: 'timeout', roomId }).then((result) => {
      if (result.ok) watch.push(result.snapshot);
      else if (result.error.code === 'too-early') clockTimer = setTimeout(askTimeout, 1000);
    });
  };
  const watchClock = (data: typeof roomData) => {
    clearTimeout(clockTimer);
    const deadline = data.turnDeadline;
    if (deadline === null) return;
    // Computer seats wait on purpose, so ask promptly; a person's time gets a wider spread.
    const currentId = data.table?.players[data.table.currentIndex]?.id;
    const botTurn = data.players.some((p) => p.id === currentId && p.bot);
    const spread = botTurn ? 100 + Math.random() * 250 : 250 + Math.random() * 750;
    const wait = Math.max(0, deadline - Date.now()) + spread;
    clockTimer = setTimeout(askTimeout, wait);
  };

  let inFlight = 0;
  const watch = watchRoom(
    roomId,
    (snapshot) => {
      roomData = snapshot.data;
      watchClock(snapshot.data);
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
    const guess = predictView(shown, move, config);
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
    config,
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
      clearTimeout(clockTimer);
      watch.stop();
      listeners.clear();
    },
    getRoomData: () => roomData,
    reclaim: () => {
      void callGame({ type: 'reclaim', roomId }).then((result) => {
        if (result.ok) watch.push(result.snapshot);
      });
    },
    leave: async () => {
      await callGame({ type: 'leave', roomId });
    },
  };
};
