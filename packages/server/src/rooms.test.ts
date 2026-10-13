import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, basicMove, createRng, getLevel, publicView } from '@tenfold/engine';
import { createMemoryStore } from './memory-store.ts';
import { handle, handsOf } from './rooms.ts';
import type { ActionResult, Deps, StoredRoom } from './types.ts';

const setup = (seed = 1) => {
  const memory = createMemoryStore();
  let next = 0;
  const deps: Deps = { random: createRng(seed), newId: () => `id-${String(next++)}` };
  const act = (userId: string, action: Parameters<typeof handle>[3]) =>
    handle(memory.store, deps, userId, action);
  return { ...memory, act };
};

const okResult = (result: ActionResult) => {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result;
};

const roomOf = (rooms: Map<string, StoredRoom>, id: string) => {
  const room = rooms.get(id);
  if (!room) throw new Error('room missing');
  return room;
};

/** Creates a room hosted by u0 and joins u1..u(n-1). */
const lobby = async (players: number, seed = 1) => {
  const t = setup(seed);
  const host = okResult(await t.act('u0', { type: 'create', name: 'Host' }));
  for (let i = 1; i < players; i++) {
    okResult(await t.act(`u${String(i)}`, { type: 'join', code: host.code, name: `P${String(i)}` }));
  }
  return { ...t, roomId: host.roomId, code: host.code };
};

describe('create', () => {
  it('makes a lobby with the creator as host in seat 0', async () => {
    const t = setup();
    const result = okResult(await t.act('u0', { type: 'create', name: 'Sam' }));
    expect(result.code).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
    const room = roomOf(t.rooms, result.roomId);
    expect(room.data).toEqual({
      code: result.code,
      status: 'lobby',
      hostPlayerId: result.playerId,
      players: [{ id: result.playerId, name: 'Sam', seat: 0 }],
      table: null,
    });
    expect(room.members).toEqual([{ playerId: result.playerId, userId: 'u0' }]);
  });

  it('picks a new code when one is taken', async () => {
    const t = setup(5);
    const first = okResult(await t.act('u0', { type: 'create', name: 'A' }));
    const again = setup(5);
    again.rooms.set('existing', { ...roomOf(t.rooms, first.roomId), id: 'existing' });
    const second = okResult(await again.act('u1', { type: 'create', name: 'B' }));
    expect(second.code).not.toBe(first.code);
  });
});

describe('join', () => {
  it('adds players in seat order', async () => {
    const t = await lobby(3);
    expect(roomOf(t.rooms, t.roomId).data.players.map((p) => [p.name, p.seat])).toEqual([
      ['Host', 0],
      ['P1', 1],
      ['P2', 2],
    ]);
  });

  it('rejoins the same seat for the same user, renaming it while in the lobby', async () => {
    const t = await lobby(2);
    const before = roomOf(t.rooms, t.roomId).data.players[1]?.id;
    const again = okResult(await t.act('u1', { type: 'join', code: t.code, name: 'Renamed' }));
    expect(again.playerId).toBe(before);
    expect(roomOf(t.rooms, t.roomId).data.players.map((p) => p.name)).toEqual(['Host', 'Renamed']);
  });

  it('keeps the name once the game has started', async () => {
    const t = await lobby(2);
    okResult(await t.act('u0', { type: 'start', roomId: t.roomId }));
    okResult(await t.act('u1', { type: 'join', code: t.code, name: 'Late rename' }));
    expect(roomOf(t.rooms, t.roomId).data.players.map((p) => p.name)).toEqual(['Host', 'P1']);
  });

  it('rejects unknown codes, full rooms, and games already started', async () => {
    const t = await lobby(6);
    expect(await t.act('x', { type: 'join', code: 'ZZZZ', name: 'X' })).toEqual({
      ok: false,
      error: { code: 'room-not-found' },
    });
    expect(await t.act('u6', { type: 'join', code: t.code, name: 'X' })).toEqual({
      ok: false,
      error: { code: 'room-full' },
    });
    const s = await lobby(2);
    okResult(await s.act('u0', { type: 'start', roomId: s.roomId }));
    expect(await s.act('late', { type: 'join', code: s.code, name: 'Late' })).toEqual({
      ok: false,
      error: { code: 'game-started' },
    });
  });
});

describe('start', () => {
  it('only the host can start, and only with 2 or more players', async () => {
    const solo = await lobby(1);
    expect(await solo.act('u0', { type: 'start', roomId: solo.roomId })).toEqual({
      ok: false,
      error: { code: 'not-enough-players' },
    });
    const t = await lobby(2);
    expect(await t.act('u1', { type: 'start', roomId: t.roomId })).toEqual({
      ok: false,
      error: { code: 'not-host' },
    });
    expect(await t.act('stranger', { type: 'start', roomId: t.roomId })).toEqual({
      ok: false,
      error: { code: 'not-a-member' },
    });
  });

  it('deals a game, publishes the table without hands, and gives each member their hand', async () => {
    const t = await lobby(3);
    okResult(await t.act('u0', { type: 'start', roomId: t.roomId }));
    const room = roomOf(t.rooms, t.roomId);
    expect(room.data.status).toBe('playing');
    expect(room.game?.players.map((p) => p.id)).toEqual(room.data.players.map((p) => p.id));
    const json = JSON.stringify(room.data);
    for (const card of room.game?.players.flatMap((p) => p.hand) ?? []) {
      expect(json).not.toContain(`"${card.id}"`);
    }
    expect(json).not.toContain('"seed"');
    const hands = handsOf(room);
    expect(hands.map((h) => [h.userId, h.cards.length])).toEqual([
      ['u0', 10],
      ['u1', 10],
      ['u2', 10],
    ]);
  });
});

describe('snapshot in the reply', () => {
  it('returns the saved version, the room data and only the caller\'s hand', async () => {
    const t = await lobby(2);
    const result = okResult(await t.act('u0', { type: 'start', roomId: t.roomId }));
    const room = roomOf(t.rooms, t.roomId);
    expect(result.snapshot.version).toBe(room.version);
    expect(result.snapshot.data).toEqual(room.data);
    expect(result.snapshot.cards).toEqual(room.game?.players.find((p) => p.id === result.playerId)?.hand);
    const others = room.game?.players.filter((p) => p.id !== result.playerId).flatMap((p) => p.hand) ?? [];
    const json = JSON.stringify(result);
    for (const card of others) expect(json).not.toContain(`"${card.id}"`);
  });

  it('has no hand before the game starts', async () => {
    const t = setup();
    const result = okResult(await t.act('u0', { type: 'create', name: 'A' }));
    expect(result.snapshot).toMatchObject({ version: 1, cards: null });
  });
});

describe('move', () => {
  it('rejects non-members and games that have not started', async () => {
    const t = await lobby(2);
    const move = { type: 'move', roomId: t.roomId, move: { type: 'draw', source: 'deck' } } as const;
    expect(await t.act('u0', move)).toEqual({ ok: false, error: { code: 'not-started' } });
    okResult(await t.act('u0', { type: 'start', roomId: t.roomId }));
    expect(await t.act('stranger', move)).toEqual({ ok: false, error: { code: 'not-a-member' } });
  });

  it('passes on the engine refusal', async () => {
    const t = await lobby(2);
    okResult(await t.act('u0', { type: 'start', roomId: t.roomId }));
    const room = roomOf(t.rooms, t.roomId);
    const waiting = room.members.find((m) => m.playerId !== room.data.players[room.data.table?.currentIndex ?? 0]?.id);
    expect(
      await t.act(waiting?.userId ?? '', {
        type: 'move',
        roomId: t.roomId,
        move: { type: 'draw', source: 'deck' },
      }),
    ).toEqual({ ok: false, error: { code: 'move-rejected', error: { code: 'not-your-turn' } } });
  });

  it('retries after a conflicting save', async () => {
    const t = await lobby(2);
    okResult(await t.act('u0', { type: 'start', roomId: t.roomId }));
    const room = roomOf(t.rooms, t.roomId);
    const current = room.data.players[room.data.table?.currentIndex ?? 0];
    const user = room.members.find((m) => m.playerId === current?.id)?.userId ?? '';
    t.failSaves(2);
    okResult(await t.act(user, { type: 'move', roomId: t.roomId, move: { type: 'draw', source: 'deck' } }));
    expect(roomOf(t.rooms, t.roomId).data.table?.step).toBe('play');
  });

  it('gives up with busy after repeated conflicts', async () => {
    const t = await lobby(2);
    okResult(await t.act('u0', { type: 'start', roomId: t.roomId }));
    const room = roomOf(t.rooms, t.roomId);
    const current = room.data.players[room.data.table?.currentIndex ?? 0];
    const user = room.members.find((m) => m.playerId === current?.id)?.userId ?? '';
    t.failSaves(10);
    expect(
      await t.act(user, { type: 'move', roomId: t.roomId, move: { type: 'draw', source: 'deck' } }),
    ).toEqual({ ok: false, error: { code: 'busy' } });
  });

  it('plays whole hands through the referee, then deals the next one', async () => {
    const t = await lobby(3, 9);
    okResult(await t.act('u0', { type: 'start', roomId: t.roomId }));
    for (let hand = 1; hand <= 3; hand++) {
      for (let i = 0; i < 3000; i++) {
        const room = roomOf(t.rooms, t.roomId);
        const game = room.game;
        if (!game || game.status !== 'playing') break;
        const current = game.players[game.currentIndex];
        const member = room.members.find((m) => m.playerId === current?.id);
        if (!current || !member) throw new Error('no current player');
        const move = basicMove(publicView(game, current.id), DEFAULT_RULES);
        okResult(await t.act(member.userId, { type: 'move', roomId: t.roomId, move }));
      }
      const room = roomOf(t.rooms, t.roomId);
      expect(room.data.table?.status).not.toBe('playing');
      if (room.data.status === 'finished') break;
      expect(await t.act('u1', { type: 'next-hand', roomId: t.roomId })).toMatchObject({ ok: true });
      expect(roomOf(t.rooms, t.roomId).data.table?.handNumber).toBe(hand + 1);
      expect(getLevel(DEFAULT_RULES, 1)).toBeDefined();
    }
  });
});
