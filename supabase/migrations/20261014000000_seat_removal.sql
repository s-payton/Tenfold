-- Players can now leave or be removed in the lobby, so a save also drops seats (and any
-- hands) that are no longer in the room's member list.
create or replace function public.commit_room(
  p_id uuid,
  p_expected_version integer,
  p_data jsonb,
  p_game jsonb,
  p_members jsonb,
  p_hands jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next integer;
begin
  update public.rooms
    set version = version + 1, data = p_data, game = p_game, updated_at = now()
    where id = p_id and version = p_expected_version
    returning version into v_next;
  if not found then
    return false;
  end if;

  delete from public.room_players as rp
    where rp.room_id = p_id
      and not exists (
        select 1 from jsonb_array_elements(p_members) as m where m ->> 'playerId' = rp.player_id
      );
  delete from public.hands as h
    where h.room_id = p_id
      and not exists (
        select 1 from jsonb_array_elements(p_members) as m where m ->> 'playerId' = h.player_id
      );

  insert into public.room_players (room_id, player_id, user_id)
    select p_id, m ->> 'playerId', (m ->> 'userId')::uuid
    from jsonb_array_elements(p_members) as m
    on conflict (room_id, player_id) do nothing;

  insert into public.hands (room_id, player_id, user_id, version, cards)
    select p_id, h ->> 'playerId', (h ->> 'userId')::uuid, v_next, h -> 'cards'
    from jsonb_array_elements(p_hands) as h
    on conflict (room_id, player_id)
    do update set cards = excluded.cards, version = excluded.version;

  -- Last, so a client woken by this change finds its hand already at the new version.
  update public.room_states set version = v_next, data = p_data, updated_at = now()
    where room_id = p_id;
  return true;
end;
$$;
