import {
  DEFAULT_RULES,
  MAX_PLAYERS,
  MIN_PLAYERS,
  applyMove,
  createGame,
  startNextHand,
  tableView,
  type Card,
  type GameState,
} from '@tenfold/engine';
import { ROOM_CODE_LENGTH, ROOM_CODE_LETTERS } from './parse.ts';
import type { Action, ActionResult, Deps, ServerError, Store, StoredRoom } from './types.ts';

const rules = DEFAULT_RULES;
const CODE_ATTEMPTS = 20;
const SAVE_ATTEMPTS = 3;

const fail = (error: ServerError): ActionResult => ({ ok: false, error });

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

/** Stores a new game state and refreshes the public table copy from it. */
const withGame = (room: StoredRoom, game: GameState): StoredRoom => ({
  ...room,
  game,
  data: {
    ...room.data,
    status: game.status === 'game-over' ? 'finished' : 'playing',
    table: tableView(game),
  },
});

type Change = { readonly ok: true; readonly room: StoredRoom; readonly playerId: string } | {
  readonly ok: false;
  readonly error: ServerError;
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
    const done = { ok: true, roomId: room.id, code: room.code, playerId: result.playerId } as const;
    if (result.room === room) return done;
    if (await store.saveRoom(result.room, room.version)) return done;
  }
  return fail({ code: 'busy' });
};

const memberOf = (room: StoredRoom, userId: string) =>
  room.members.find((m) => m.userId === userId)?.playerId;

const create = async (store: Store, deps: Deps, userId: string, name: string) => {
  const playerId = deps.newId();
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
    const code = roomCode(deps.random);
    const room: StoredRoom = {
      id: deps.newId(),
      code,
      version: 0,
      data: { code, status: 'lobby', hostPlayerId: playerId, players: [{ id: playerId, name, seat: 0 }], table: null },
      game: null,
      members: [{ playerId, userId }],
    };
    if (await store.createRoom(room)) return { ok: true, roomId: room.id, code, playerId } as const;
  }
  return fail({ code: 'busy' });
};

const join = (deps: Deps, userId: string, name: string) => (room: StoredRoom): Change => {
  const existing = memberOf(room, userId);
  if (existing) return { ok: true, room, playerId: existing };
  if (room.data.status !== 'lobby') return { ok: false, error: { code: 'game-started' } };
  if (room.data.players.length >= MAX_PLAYERS) return { ok: false, error: { code: 'room-full' } };
  const playerId = deps.newId();
  return {
    ok: true,
    playerId,
    room: {
      ...room,
      data: {
        ...room.data,
        players: [...room.data.players, { id: playerId, name, seat: room.data.players.length }],
      },
      members: [...room.members, { playerId, userId }],
    },
  };
};

const start = (deps: Deps, userId: string) => (room: StoredRoom): Change => {
  const playerId = memberOf(room, userId);
  if (!playerId) return { ok: false, error: { code: 'not-a-member' } };
  if (room.data.hostPlayerId !== playerId) return { ok: false, error: { code: 'not-host' } };
  if (room.data.status !== 'lobby') return { ok: false, error: { code: 'game-started' } };
  if (room.data.players.length < MIN_PLAYERS) {
    return { ok: false, error: { code: 'not-enough-players' } };
  }
  const seats = [...room.data.players].sort((a, b) => a.seat - b.seat).map((p) => p.id);
  const seed = Math.floor(deps.random() * 0x100000000);
  return { ok: true, playerId, room: withGame(room, createGame(seats, rules, seed)) };
};

const play =
  (userId: string, run: (game: GameState, playerId: string) => Change | GameState) =>
  (room: StoredRoom): Change => {
    const playerId = memberOf(room, userId);
    if (!playerId) return { ok: false, error: { code: 'not-a-member' } };
    if (!room.game) return { ok: false, error: { code: 'not-started' } };
    const result = run(room.game, playerId);
    return 'ok' in result ? result : { ok: true, playerId, room: withGame(room, result) };
  };

/** Runs one request from `userId` (the verified auth user) against the store. */
export const handle = async (
  store: Store,
  deps: Deps,
  userId: string,
  action: Action,
): Promise<ActionResult> => {
  switch (action.type) {
    case 'create':
      return create(store, deps, userId, action.name);
    case 'join':
      return mutate(store, { code: action.code }, join(deps, userId, action.name));
    case 'start':
      return mutate(store, { id: action.roomId }, start(deps, userId));
    case 'move':
      return mutate(
        store,
        { id: action.roomId },
        play(userId, (game, playerId) => {
          const result = applyMove(game, playerId, action.move, rules);
          return result.ok ? result.state : { ok: false, error: { code: 'move-rejected', error: result.error } };
        }),
      );
    case 'next-hand':
      return mutate(
        store,
        { id: action.roomId },
        play(userId, (game) => {
          const result = startNextHand(game, rules);
          return result.ok ? result.state : { ok: false, error: { code: 'move-rejected', error: result.error } };
        }),
      );
  }
};
