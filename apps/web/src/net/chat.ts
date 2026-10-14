import { REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js';
import type { ChatEntry } from '../game/client.ts';
import type { Database } from './schema.ts';
import { supabase } from './supabase.ts';

/** Messages kept on screen. The database keeps a few more. */
const HISTORY = 50;

type Row = Database['public']['Tables']['room_messages']['Row'];

let watchCount = 0;

const toEntry = (row: Row, live: boolean): ChatEntry => ({
  id: row.id,
  playerId: row.player_id,
  at: Date.parse(row.created_at),
  body: row.body,
  live,
});

/**
 * Calls `onChange` with the room's recent messages now and whenever one arrives.
 * Messages that come in over Realtime are live; ones found by a re-read (after a
 * dropped connection or a phone wake) are history.
 */
export const watchChat = (roomId: string, onChange: (messages: readonly ChatEntry[]) => void) => {
  let stopped = false;
  let messages: readonly ChatEntry[] = [];

  const merge = (incoming: readonly ChatEntry[]) => {
    const known = new Set(messages.map((m) => m.id));
    const fresh = incoming.filter((m) => !known.has(m.id));
    if (stopped || fresh.length === 0) return;
    messages = [...messages, ...fresh].sort((a, b) => a.id - b.id).slice(-HISTORY);
    onChange(messages);
  };

  const load = () => {
    void supabase
      .from('room_messages')
      .select('id, room_id, player_id, body, created_at')
      .eq('room_id', roomId)
      .order('id', { ascending: false })
      .limit(HISTORY)
      .then(({ data }) => {
        if (data) merge(data.map((row) => toEntry(row, false)));
      });
  };

  watchCount += 1;
  const channel = supabase
    .channel(`chat:${roomId}:${String(watchCount)}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'room_messages', filter: `room_id=eq.${roomId}` },
      (payload) => merge([toEntry(payload.new as Row, true)]),
    )
    .subscribe((status) => {
      if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) load();
    });
  const onVisible = () => {
    if (document.visibilityState === 'visible') load();
  };
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    stopped = true;
    document.removeEventListener('visibilitychange', onVisible);
    void supabase.removeChannel(channel);
  };
};
