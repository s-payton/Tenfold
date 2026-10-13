import { REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js';
import type { RoomData, RoomSnapshot } from '@tenfold/server';
import { supabase } from './supabase.ts';

export type { RoomSnapshot };

const MAX_READ_ATTEMPTS = 6;
const RETRY_MS = 150;
/** Safety net for dropped Realtime connections, for example after a phone sleeps. */
const POLL_MS = 10_000;

let watchCount = 0;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Reads the public room state and this player's hand (row-level security returns only
 * theirs). Retries until both come from the same save, so the table and hand always match.
 */
export const readRoom = async (roomId: string): Promise<RoomSnapshot | null> => {
  for (let attempt = 0; attempt < MAX_READ_ATTEMPTS; attempt++) {
    const [state, hand] = await Promise.all([
      supabase.from('room_states').select('version, data').eq('room_id', roomId).maybeSingle(),
      supabase.from('hands').select('version, cards').eq('room_id', roomId).maybeSingle(),
    ]);
    if (state.error || !state.data) return null;
    const { version, data } = state.data;
    if (!data.table) return { version, data, cards: null };
    if (hand.data?.version === version) return { version, data, cards: hand.data.cards };
    await wait(RETRY_MS);
  }
  return null;
};

export interface RoomWatch {
  /** Re-reads now. */
  readonly refresh: () => void;
  /** Applies a snapshot the server sent back with a reply. It wins over anything at its version. */
  readonly push: (snapshot: RoomSnapshot) => void;
  readonly stop: () => void;
}

/**
 * Calls `onSnapshot` with the room now and after every change.
 *
 * Realtime messages carry the new public room data. A player's own hand only changes on
 * their own moves (which come back in the reply) or on a new deal, so within a hand a
 * message can be applied straight away with the hand already known. Anything else
 * triggers a full re-read. A slow poll and a re-read on wake cover dropped connections.
 */
export const watchRoom = (
  roomId: string,
  onSnapshot: (snapshot: RoomSnapshot) => void,
  /** True while this player has a move in flight; its reply will carry the result. */
  isBusy: () => boolean = () => false,
): RoomWatch => {
  let stopped = false;
  let current: RoomSnapshot | null = null;

  const apply = (snapshot: RoomSnapshot, replaceSameVersion: boolean) => {
    if (stopped || !current) {
      if (!stopped) {
        current = snapshot;
        onSnapshot(snapshot);
      }
      return;
    }
    const newer = snapshot.version > current.version;
    const same = snapshot.version === current.version;
    if (!newer && !(same && replaceSameVersion)) return;
    current = snapshot;
    onSnapshot(snapshot);
  };

  // Server replies and full reads hold this player's real hand, so they are authoritative.
  const push = (snapshot: RoomSnapshot) => apply(snapshot, true);

  const refresh = () => {
    void readRoom(roomId).then((snapshot) => {
      if (snapshot) push(snapshot);
    });
  };

  const onMessage = (row: { version?: unknown; data?: unknown }) => {
    const version = typeof row.version === 'number' ? row.version : null;
    const data = row.data as RoomData | undefined;
    const known = current;
    const sameHand =
      known?.cards && data?.table && known.data.table?.handNumber === data.table.handNumber;
    // Our own move echoes back here too, often before its reply. The reply has the
    // updated hand, so wait for it rather than pairing new data with the old hand.
    if (isBusy()) return;
    if (version !== null && data && known && sameHand) apply({ version, data, cards: known.cards }, false);
    else refresh();
  };

  // Supabase reuses a channel with the same topic, so every watch gets its own.
  watchCount += 1;
  const channel = supabase
    .channel(`room:${roomId}:${String(watchCount)}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'room_states', filter: `room_id=eq.${roomId}` },
      (payload) => onMessage(payload.new),
    )
    .subscribe((status) => {
      if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) refresh();
    });
  const onVisible = () => {
    if (document.visibilityState === 'visible') refresh();
  };
  document.addEventListener('visibilitychange', onVisible);
  const poll = setInterval(refresh, POLL_MS);
  refresh();
  return {
    refresh,
    push,
    stop: () => {
      stopped = true;
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      void supabase.removeChannel(channel);
    },
  };
};
