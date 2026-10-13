import { REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js';
import type { Card } from '@tenfold/engine';
import type { RoomData } from '@tenfold/server';
import { supabase } from './supabase.ts';

export interface RoomSnapshot {
  readonly version: number;
  readonly data: RoomData;
  /** This player's hand. Null before the game starts. */
  readonly cards: readonly Card[] | null;
}

const MAX_READ_ATTEMPTS = 6;
const RETRY_MS = 150;

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
  /** Re-reads now, for example right after this player's own move. */
  readonly refresh: () => void;
  readonly stop: () => void;
}

/** Calls `onSnapshot` with the room now and after every change, via Supabase Realtime. */
export const watchRoom = (roomId: string, onSnapshot: (snapshot: RoomSnapshot) => void): RoomWatch => {
  let stopped = false;
  let latest = 0;
  const refresh = () => {
    void readRoom(roomId).then((snapshot) => {
      if (stopped || !snapshot || snapshot.version < latest) return;
      latest = snapshot.version;
      onSnapshot(snapshot);
    });
  };
  const channel = supabase
    .channel(`room:${roomId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'room_states', filter: `room_id=eq.${roomId}` },
      refresh,
    )
    .subscribe((status) => {
      if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) refresh();
    });
  refresh();
  return {
    refresh,
    stop: () => {
      stopped = true;
      void supabase.removeChannel(channel);
    },
  };
};
