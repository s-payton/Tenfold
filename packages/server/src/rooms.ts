import {
  DEFAULT_HOUSE_RULES,
  MAX_PLAYERS,
  MIN_PLAYERS,
  applyMove,
  autoMove,
  botMove,
  createGame,
  publicView,
  rulesFromHouse,
  startNextHand,
  tableView,
  type BotLevel,
  type Card,
  type GameState,
  type MoveResult,
  type RulesConfig,
} from '@tenfold/engine';
import { ROOM_CODE_LENGTH, ROOM_CODE_LETTERS } from './parse.ts';
import type {
  Action,
  ActionResult,
  Deps,
  RoomPlayer,
  RoomSettings,
  RoomSnapshot,
  ServerError,
  Store,
  StoredRoom,
} from './types.ts';

export const DEFAULT_SETTINGS: RoomSettings = {
  rules: DEFAULT_HOUSE_RULES,
  table: 'green',
  turnSeconds: 30,
};

/** The rules this room plays by. */
export const roomRules = (room: StoredRoom): RulesConfig => rulesFromHouse(room.data.settings.rules);

const CODE_ATTEMPTS = 20;
const SAVE_ATTEMPTS = 3;
/** Pause before a computer seat plays, so people can follow along. */
export const BOT_TURN_MS = 1_200;
/** Missed turns in a row before a bot takes over the seat. */
export const MISSES_BEFORE_BOT = 2;
export const STAND_IN_LEVEL: BotLevel = 'medium';
const BOT_NAMES = ['Ada', 'Bo', 'Cy', 'Dee', 'Eli', 'Fay', 'Gus'];
/** Safety cap on moves a computer makes in one turn. */
const MAX_AUTO_MOVES = 40;

const fail = (error: ServerError): ActionResult => ({ ok: false, error });

type Change =
  | { readonly ok: true; readonly room: StoredRoom; readonly playerId: string }
  | { readonly ok: false; readonly error: ServerError };

const refuse = (code: Extract<ServerError, { code: string }>['code']): Change =>
  ({ ok: false, error: { code } }) as Change;

const roomCode = (random: () => number): string =>
  Array.from(
    { length: ROOM_CODE_LENGTH },
    () => ROOM_CODE_LETTERS[Math.floor(random() * ROOM_CODE_LETTERS.length)] ?? 'B',
  ).join('');

/** Each member's private hand, written to the `hands` table under row-level security. */
export const handsOf = (
  room: StoredRoom,
): { readonly playerId: string; readonly userId: string; readonly cards: readonly Card[] }[] =>
  room.members.map((m) => ({
    playerId: m.playerId,
    userId: m.userId,
    cards: room.game?.players.find((p) => p.id === m.playerId)?.hand ?? [],
  }));

/** The snapshot `playerId` sees of `room` once it is saved at `version`. */
export const snapshotFor = (room: StoredRoom, playerId: string, version: number): RoomSnapshot => ({
  version,
  data: room.data,
  cards: room.game ? (room.game.players.find((p) => p.id === playerId)?.hand ?? []) : null,
});

const memberOf = (room: StoredRoom, userId: string) =>
  room.members.find((m) => m.userId === userId)?.playerId;

const seatOf = (room: StoredRoom, playerId: string | undefined) =>
  room.data.players.find((p) => p.id === playerId);

const withPlayers = (room: StoredRoom, players: readonly RoomPlayer[]): StoredRoom => ({
  ...room,
  data: { ...room.data, players: players.map((p, seat) => ({ ...p, seat })) },
});

const updateSeat = (room: StoredRoom, playerId: string, change: Partial<RoomPlayer>): StoredRoom =>
  withPlayers(
    room,
    room.data.players.map((p) => (p.id === playerId ? { ...p, ...change } : p)),
  );

/** Stores a game state, refreshes the public table, and starts the clock for whoever is up. */
const withGame = (room: StoredRoom, game: GameState, now: number): StoredRoom => {
  const current = seatOf(room, game.players[game.currentIndex]?.id);
  const personMs = room.data.settings.turnSeconds === null ? null : room.data.settings.turnSeconds * 1000;
  const turnMs = current?.bot ? BOT_TURN_MS : personMs;
  const turnDeadline = game.status === 'playing' && turnMs !== null ? now + turnMs : null;
  return {
    ...room,
    game,
    data: {
      ...room.data,
      status: game.status === 'game-over' ? 'finished' : 'playing',
      table: tableView(game),
      turnDeadline,
    },
  };
};

/** Loads, changes and saves a room, retrying from a fresh copy if another request saved first. */
const mutate = async (
  store: Store,
  key: { readonly id: string } | { readonly code: string },
  change: (room: StoredRoom) => Change,
): Promise<ActionResult> => {
  for (let attempt = 0; attempt < SAVE_ATTEMPTS; attempt++) {
    const room = await store.loadRoom(key);
    if (!room) return fail({ code: 'room-not-found' });
    const result = change(room);
    if (!result.ok) return fail(result.error);
    const done = (saved: StoredRoom, version: number): ActionResult => ({
      ok: true,
      roomId: room.id,
      code: room.code,
      playerId: result.playerId,
      snapshot: snapshotFor(saved, result.playerId, version),
    });
    if (result.room === room) return done(room, room.version);
    if (await store.saveRoom(result.room, room.version)) return done(result.room, room.version + 1);
  }
  return fail({ code: 'busy' });
};

const newSeat = (id: string, name: string, bot: BotLevel | null): RoomPlayer => ({
  id,
  name,
  seat: 0,
  bot,
  missed: 0,
});

const create = async (store: Store, deps: Deps, userId: string, name: string): Promise<ActionResult> => {
  const playerId = deps.newId();
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
    const code = roomCode(deps.random);
    const room: StoredRoom = {
      id: deps.newId(),
      code,
      version: 0,
      data: {
        code,
        status: 'lobby',
        hostPlayerId: playerId,
        settings: DEFAULT_SETTINGS,
        players: [newSeat(playerId, name, null)],
        table: null,
        turnDeadline: null,
      },
      game: null,
      members: [{ playerId, userId }],
    };
    if (await store.createRoom(room)) {
      return { ok: true, roomId: room.id, code, playerId, snapshot: snapshotFor(room, playerId, 1) };
    }
  }
  return fail({ code: 'busy' });
};

const join = (deps: Deps, userId: string, name: string) => (room: StoredRoom): Change => {
  const existing = memberOf(room, userId);
  if (existing) {
    // Rejoining from the lobby with a new name renames the seat.
    if (room.data.status !== 'lobby' || seatOf(room, existing)?.name === name) {
      return { ok: true, room, playerId: existing };
    }
    return { ok: true, playerId: existing, room: updateSeat(room, existing, { name }) };
  }
  if (room.data.status !== 'lobby') return refuse('game-started');
  if (room.data.players.length >= MAX_PLAYERS) return refuse('room-full');
  const playerId = deps.newId();
  return {
    ok: true,
    playerId,
    room: {
      ...withPlayers(room, [...room.data.players, newSeat(playerId, name, null)]),
      members: [...room.members, { playerId, userId }],
    },
  };
};

/** Host-only lobby changes. */
const hostInLobby = (room: StoredRoom, userId: string): string | Change => {
  const playerId = memberOf(room, userId);
  if (!playerId) return refuse('not-a-member');
  if (room.data.hostPlayerId !== playerId) return refuse('not-host');
  if (room.data.status !== 'lobby') return refuse('not-in-lobby');
  return playerId;
};

const start = (deps: Deps, userId: string) => (room: StoredRoom): Change => {
  const playerId = hostInLobby(room, userId);
  if (typeof playerId !== 'string') return playerId;
  if (room.data.players.length < MIN_PLAYERS) return refuse('not-enough-players');
  const seats = room.data.players.map((p) => p.id);
  const seed = Math.floor(deps.random() * 0x100000000);
  return { ok: true, playerId, room: withGame(room, createGame(seats, roomRules(room), seed), deps.now()) };
};

const addBot = (deps: Deps, userId: string, level: BotLevel) => (room: StoredRoom): Change => {
  const playerId = hostInLobby(room, userId);
  if (typeof playerId !== 'string') return playerId;
  if (room.data.players.length >= MAX_PLAYERS) return refuse('room-full');
  const taken = new Set(room.data.players.map((p) => p.name));
  const name = BOT_NAMES.find((n) => !taken.has(n)) ?? `Bot ${String(room.data.players.length + 1)}`;
  return {
    ok: true,
    playerId,
    room: withPlayers(room, [...room.data.players, newSeat(deps.newId(), name, level)]),
  };
};

const removeSeat = (room: StoredRoom, target: string): StoredRoom => ({
  ...withPlayers(
    room,
    room.data.players.filter((p) => p.id !== target),
  ),
  members: room.members.filter((m) => m.playerId !== target),
});

const remove = (userId: string, target: string) => (room: StoredRoom): Change => {
  const playerId = hostInLobby(room, userId);
  if (typeof playerId !== 'string') return playerId;
  if (target === playerId || !seatOf(room, target)) return refuse('bad-request');
  return { ok: true, playerId, room: removeSeat(room, target) };
};

const leave = (deps: Deps, userId: string) => (room: StoredRoom): Change => {
  const playerId = memberOf(room, userId);
  if (!playerId) return refuse('not-a-member');
  if (room.data.status === 'lobby') {
    const rest = removeSeat(room, playerId);
    const humans = rest.data.players.filter((p) => rest.members.some((m) => m.playerId === p.id));
    const host = room.data.hostPlayerId === playerId ? humans[0]?.id : room.data.hostPlayerId;
    // With no people left, the room closes.
    const data = host
      ? { ...rest.data, hostPlayerId: host }
      : { ...rest.data, status: 'finished' as const };
    return { ok: true, playerId, room: { ...rest, data } };
  }
  if (room.data.status === 'finished' || !room.game) return { ok: true, room, playerId };
  // Mid-game, a bot takes the seat right away; the person can come back and reclaim it.
  const next = updateSeat(room, playerId, { bot: STAND_IN_LEVEL });
  const isTurn = room.game.players[room.game.currentIndex]?.id === playerId;
  return { ok: true, playerId, room: isTurn ? withGame(next, room.game, deps.now()) : next };
};

const reclaim = (deps: Deps, userId: string) => (room: StoredRoom): Change => {
  const playerId = memberOf(room, userId);
  if (!playerId) return refuse('not-a-member');
  const next = updateSeat(room, playerId, { bot: null, missed: 0 });
  const isTurn = room.game?.players[room.game.currentIndex]?.id === playerId;
  return { ok: true, playerId, room: room.game && isTurn ? withGame(next, room.game, deps.now()) : next };
};

/** Plays the current turn for whoever is up: their bot, or the timeout auto-play. */
const playTurnFor = (
  game: GameState,
  playerId: string,
  level: BotLevel | null,
  rules: RulesConfig,
  deps: Deps,
): GameState => {
  let state = game;
  for (let i = 0; i < MAX_AUTO_MOVES && state.status === 'playing' && state.turn === game.turn; i++) {
    const view = publicView(state, playerId);
    const move = level ? botMove(view, rules, level, deps.random) : autoMove(view, rules);
    const result = applyMove(state, playerId, move, rules);
    if (!result.ok) break;
    state = result.state;
  }
  return state;
};

const timeout = (deps: Deps, userId: string) => (room: StoredRoom): Change => {
  const playerId = memberOf(room, userId);
  if (!playerId) return refuse('not-a-member');
  const game = room.game;
  const deadline = room.data.turnDeadline;
  if (!game || game.status !== 'playing' || deadline === null) return { ok: true, room, playerId };
  if (deps.now() < deadline) return refuse('too-early');
  const currentId = game.players[game.currentIndex]?.id ?? '';
  const seat = seatOf(room, currentId);
  const level = seat?.bot ?? null;
  const played = playTurnFor(game, currentId, level, roomRules(room), deps);
  let next = room;
  if (!level && seat) {
    const missed = seat.missed + 1;
    next = updateSeat(room, currentId, {
      missed,
      bot: missed >= MISSES_BEFORE_BOT ? STAND_IN_LEVEL : null,
    });
  }
  return { ok: true, playerId, room: withGame(next, played, deps.now()) };
};

const play =
  (deps: Deps, userId: string, run: (game: GameState, playerId: string, rules: RulesConfig) => MoveResult) =>
  (room: StoredRoom): Change => {
    const playerId = memberOf(room, userId);
    if (!playerId) return refuse('not-a-member');
    if (!room.game) return refuse('not-started');
    const result = run(room.game, playerId, roomRules(room));
    if (!result.ok) return { ok: false, error: { code: 'move-rejected', error: result.error } };
    // A person who moves is clearly here: clear their misses and any stand-in bot.
    const active = updateSeat(room, playerId, { missed: 0, bot: null });
    return { ok: true, playerId, room: withGame(active, result.state, deps.now()) };
  };

/** Runs one request from `userId` (the verified auth user) against the store. */
export const handle = async (
  store: Store,
  deps: Deps,
  userId: string,
  action: Action,
): Promise<ActionResult> => {
  const byId = { id: 'roomId' in action ? action.roomId : '' };
  switch (action.type) {
    case 'create':
      return create(store, deps, userId, action.name);
    case 'join':
      return mutate(store, { code: action.code }, join(deps, userId, action.name));
    case 'start':
      return mutate(store, byId, start(deps, userId));
    case 'move':
      return mutate(
        store,
        byId,
        play(deps, userId, (game, id, rules) => applyMove(game, id, action.move, rules)),
      );
    case 'next-hand':
      return mutate(store, byId, play(deps, userId, (game, _id, rules) => startNextHand(game, rules)));
    case 'timeout':
      return mutate(store, byId, timeout(deps, userId));
    case 'reclaim':
      return mutate(store, byId, reclaim(deps, userId));
    case 'leave':
      return mutate(store, byId, leave(deps, userId));
    case 'add-bot':
      return mutate(store, byId, addBot(deps, userId, action.level));
    case 'remove':
      return mutate(store, byId, remove(userId, action.playerId));
    case 'settings':
      return mutate(store, byId, (room) => {
        const playerId = hostInLobby(room, userId);
        if (typeof playerId !== 'string') return playerId;
        return { ok: true, playerId, room: { ...room, data: { ...room.data, settings: action.settings } } };
      });
  }
};
