-- Rooms, seats, the public table, and private hands.
-- Clients never write to any table. Every write goes through the `game` Edge Function,
-- which runs the shared engine and then calls create_room or commit_room as service_role.

create table public.rooms (
  id uuid primary key,
  code text not null unique,
  version integer not null,
  -- Public room data (also copied to room_states for members to read).
  data jsonb not null,
  -- Full game state, including every hand and the shuffle seed. Server only.
  game jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.room_players (
  room_id uuid not null references public.rooms (id) on delete cascade,
  player_id text not null,
  user_id uuid not null,
  primary key (room_id, player_id),
  unique (room_id, user_id)
);

create table public.room_states (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  version integer not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.hands (
  room_id uuid not null references public.rooms (id) on delete cascade,
  player_id text not null,
  user_id uuid not null,
  version integer not null,
  cards jsonb not null,
  primary key (room_id, player_id)
);

create index hands_user_id_idx on public.hands (user_id);
create index room_players_user_id_idx on public.room_players (user_id);

alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.room_states enable row level security;
alter table public.hands enable row level security;

-- rooms and room_players have no policies: no client can read or write them.

create function public.is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.room_players
    where room_id = p_room_id and user_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_room_member(uuid) from public, anon;
grant execute on function public.is_room_member(uuid) to authenticated;

create policy "Members read their room's public state"
  on public.room_states for select
  to authenticated
  using (public.is_room_member(room_id));

create policy "Players read only their own hand"
  on public.hands for select
  to authenticated
  using (user_id = (select auth.uid()));

alter publication supabase_realtime add table public.room_states;

-- Creates a room at version 1. Returns false if the code is already taken.
create function public.create_room(p_id uuid, p_code text, p_data jsonb, p_members jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.rooms (id, code, version, data) values (p_id, p_code, 1, p_data);
  insert into public.room_states (room_id, version, data) values (p_id, 1, p_data);
  insert into public.room_players (room_id, player_id, user_id)
    select p_id, m ->> 'playerId', (m ->> 'userId')::uuid
    from jsonb_array_elements(p_members) as m;
  return true;
exception
  when unique_violation then return false;
end;
$$;

-- Saves a room only if nobody else saved since `p_expected_version`, all in one transaction.
create function public.commit_room(
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

revoke execute on function public.create_room(uuid, text, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.commit_room(uuid, integer, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_room(uuid, text, jsonb, jsonb) to service_role;
grant execute on function public.commit_room(uuid, integer, jsonb, jsonb, jsonb, jsonb) to service_role;
