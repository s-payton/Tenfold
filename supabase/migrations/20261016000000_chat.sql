-- Chat, quick emoji reactions, and thrown eggs and pies.
-- Like everything else, clients only read. The `game` Edge Function checks that the
-- sender is in the room, then calls post_message as service_role. Messages live apart
-- from the room so chatting never bumps the room version or races with moves.

create table public.room_messages (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms (id) on delete cascade,
  player_id text not null,
  body jsonb not null,
  created_at timestamptz not null default now()
);

create index room_messages_room_id_idx on public.room_messages (room_id, id);

alter table public.room_messages enable row level security;

revoke all on public.room_messages from anon, authenticated;
grant select on public.room_messages to authenticated;

create policy "Members read their room's messages"
  on public.room_messages for select
  to authenticated
  using (public.is_room_member(room_id));

alter publication supabase_realtime add table public.room_messages;

-- Stores one message. Returns false if this player sent 8 or more in the last 10 seconds.
-- Keeps only the newest 200 messages per room.
create function public.post_message(p_room_id uuid, p_player_id text, p_body jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    select count(*) from public.room_messages
    where room_id = p_room_id
      and player_id = p_player_id
      and created_at > now() - interval '10 seconds'
  ) >= 8 then
    return false;
  end if;

  insert into public.room_messages (room_id, player_id, body) values (p_room_id, p_player_id, p_body);

  delete from public.room_messages
    where room_id = p_room_id
      and id <= (
        select id from public.room_messages
        where room_id = p_room_id
        order by id desc
        offset 200 limit 1
      );
  return true;
end;
$$;

revoke execute on function public.post_message(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.post_message(uuid, text, jsonb) to service_role;
