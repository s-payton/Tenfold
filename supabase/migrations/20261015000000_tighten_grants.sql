-- Defense in depth. Supabase grants anon and authenticated full table privileges by
-- default, and row-level security is what blocks them. Clients only ever read
-- room_states and hands (as signed-in anonymous users), so take away everything else.
-- TRUNCATE in particular is not covered by row-level security.

revoke all on public.rooms, public.room_players, public.room_states, public.hands from anon, authenticated;

grant select on public.room_states, public.hands to authenticated;
