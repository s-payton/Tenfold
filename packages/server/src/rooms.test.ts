import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, basicMove, createRng, getLevel, publicView } from '@tenfold/engine';
import { createMemoryStore } from './memory-store.ts';
import { BOT_TURN_MS, DEFAULT_SETTINGS, MIN_RESUME_MS, handle, handsOf, roomRules } from './rooms.ts';

const TURN_MS = 30_000;
import type { ActionResult, Deps, StoredRoom } from './types.ts';

const setup = (seed = 1) => {
  const memory = createMemoryStore();
  let next = 0;
  let clock = 1_000_000;
  const deps: Deps = { random: createRng(seed), newId: () => `id-${String(next++)}`, now: () => clock };
  const act = (userId: string, action: Parameters<typeof handle>[3]) =>
    handle(memory.store, deps, userId, action);
  return {
    ...memory,
    act,
    now: () => clock,
    advance: (ms: number) => {
      clock += ms;
    },
  };
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
      settings: DEFAULT_SETTINGS,
      players: [{ id: result.playerId, name: 'Sam', seat: 0, bot: null, missed: 0 }],
      table: null,
      turnDeadline: null,
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

/** The user whose turn it is in a started room. */
const currentUser = (rooms: Map<string, StoredRoom>, roomId: string) => {
  const room = roomOf(rooms, roomId);
  const id = room.game?.players[room.game.currentIndex]?.id;
  return { playerId: id ?? '', userId: room.members.find((m) => m.playerId === id)?.userId ?? '' };
};

describe('turn timer', () => {
  it('starts a 30 second clock for the first player and resets it on every move', async () => {
    const t = await lobby(2);
    okResult(await t.act('u0', { type: 'start', roomId: t.roomId }));
    expect(roomOf(t.rooms, t.roomId).data.turnDeadline).toBe(t.now() + TURN_MS);
    t.advance(10_000);
    const { userId } = currentUser(t.rooms, t.roomId);
    okResult(await t.act(userId, { type: 'move', roomId: t.roomId, move: { type: 'draw', source: 'deck' } }));
    expect(roomOf(t.rooms, t.roomId).data.turnDeadline).toBe(t.now() + TURN_MS);
  });

  it('refuses a timeout before the deadline', async () => {
    const t = await lobby(2);
    okResult(await t.act('u0', { type: 'start', roomId: t.roomId }));
    t.advance(TURN_MS - 1);
    expect(await t.act('u1', { type: 'timeout', roomId: t.roomId })).toEqual({
      ok: false,
      error: { code: 'too-early' },
    });
  });

  it('auto-plays a missed turn, and a bot takes the seat after 2 misses in a row', async () => {
    const t = await lobby(2);
    okResult(await t.act('u0', { type: 'start', roomId: t.roomId }));
    const sleeper = currentUser(t.rooms, t.roomId);
    const awake = sleeper.userId === 'u0' ? 'u1' : 'u0';
    const seat = () => roomOf(t.rooms, t.roomId).data.players.find((p) => p.id === sleeper.playerId);

    t.advance(TURN_MS);
    okResult(await t.act(awake, { type: 'timeout', roomId: t.roomId }));
    expect(seat()).toMatchObject({ missed: 1, bot: null });
    expect(currentUser(t.rooms, t.roomId).playerId).not.toBe(sleeper.playerId);

    // The awake player takes a normal turn.
    for (const move of [{ type: 'draw', source: 'deck' }] as const) {
      okResult(await t.act(awake, { type: 'move', roomId: t.roomId, move }));
    }
    const room = roomOf(t.rooms, t.roomId);
    const card = room.game?.players.find((p) => p.id !== sleeper.playerId)?.hand.find((c) => c.kind === 'number');
    okResult(await t.act(awake, { type: 'move', roomId: t.roomId, move: { type: 'discard', cardId: card?.id ?? '' } }));

    t.advance(TURN_MS);
    okResult(await t.act(awake, { type: 'timeout', roomId: t.roomId }));
    expect(seat()).toMatchObject({ missed: 2, bot: 'medium' });
  });

  it('a move clears the misses, and reclaim takes the seat back from the bot', async () => {
    const t = await lobby(2);
    okResult(await t.act('u0', { type: 'start', roomId: t.roomId }));
    const sleeper = currentUser(t.rooms, t.roomId);
    t.advance(TURN_MS);
    const other = sleeper.userId === 'u0' ? 'u1' : 'u0';
    okResult(await t.act(other, { type: 'timeout', roomId: t.roomId }));
    okResult(await t.act(sleeper.userId, { type: 'leave', roomId: t.roomId }));
    const seat = () => roomOf(t.rooms, t.roomId).data.players.find((p) => p.id === sleeper.playerId);
    expect(seat()?.bot).toBe('medium');
    okResult(await t.act(sleeper.userId, { type: 'reclaim', roomId: t.roomId }));
    expect(seat()).toMatchObject({ bot: null, missed: 0 });
  });

  it('gives computer seats a short clock and plays their whole turn on timeout', async () => {
    const t = setup();
    const host = okResult(await t.act('u0', { type: 'create', name: 'Host' }));
    okResult(await t.act('u0', { type: 'add-bot', roomId: host.roomId, level: 'hard' }));
    okResult(await t.act('u0', { type: 'start', roomId: host.roomId }));
    // Play until the bot is up, then let it move.
    for (let i = 0; i < 4; i++) {
      const room = roomOf(t.rooms, host.roomId);
      const current = room.data.players.find((p) => p.id === room.game?.players[room.game.currentIndex]?.id);
      if (current?.bot) break;
      t.advance(TURN_MS);
      okResult(await t.act('u0', { type: 'timeout', roomId: host.roomId }));
    }
    const before = roomOf(t.rooms, host.roomId);
    expect(before.data.turnDeadline).toBe(t.now() + BOT_TURN_MS);
    t.advance(BOT_TURN_MS);
    okResult(await t.act('u0', { type: 'timeout', roomId: host.roomId }));
    const after = roomOf(t.rooms, host.roomId);
    expect(after.game?.turn).toBeGreaterThan(before.game?.turn ?? 0);
    expect(after.data.players.find((p) => p.bot)?.missed).toBe(0);
  });
});

describe('pause', () => {
  const started = async () => {
    const t = await lobby(3);
    okResult(await t.act('u0', { type: 'start', roomId: t.roomId }));
    return t;
  };

  it('stops the clock, records who paused, and blocks moves and timeouts', async () => {
    const t = await started();
    t.advance(10_000);
    const pauser = okResult(await t.act('u2', { type: 'pause', roomId: t.roomId }));
    const room = roomOf(t.rooms, t.roomId);
    expect(room.data.turnDeadline).toBeNull();
    expect(room.data.paused).toEqual({ by: pauser.playerId, remainingMs: TURN_MS - 10_000 });

    const { userId } = currentUser(t.rooms, t.roomId);
    expect(await t.act(userId, { type: 'move', roomId: t.roomId, move: { type: 'draw', source: 'deck' } })).toEqual({
      ok: false,
      error: { code: 'paused' },
    });
    t.advance(TURN_MS * 5);
    okResult(await t.act('u1', { type: 'timeout', roomId: t.roomId }));
    expect(roomOf(t.rooms, t.roomId).game?.turn).toBe(room.game?.turn);
  });

  it('anyone can resume, and the turn picks up where it left off', async () => {
    const t = await started();
    t.advance(10_000);
    okResult(await t.act('u2', { type: 'pause', roomId: t.roomId }));
    t.advance(60_000);
    okResult(await t.act('u1', { type: 'resume', roomId: t.roomId }));
    const room = roomOf(t.rooms, t.roomId);
    expect(room.data.paused).toBeNull();
    expect(room.data.turnDeadline).toBe(t.now() + TURN_MS - 10_000);
    const { userId } = currentUser(t.rooms, t.roomId);
    okResult(await t.act(userId, { type: 'move', roomId: t.roomId, move: { type: 'draw', source: 'deck' } }));
  });

  it('leaves at least a few seconds on the clock after a resume', async () => {
    const t = await started();
    t.advance(TURN_MS - 500);
    okResult(await t.act('u1', { type: 'pause', roomId: t.roomId }));
    expect(roomOf(t.rooms, t.roomId).data.paused?.remainingMs).toBe(MIN_RESUME_MS);
  });

  it('pausing twice keeps the first pause, and only a running clock can be paused', async () => {
    const t = await started();
    const first = okResult(await t.act('u1', { type: 'pause', roomId: t.roomId }));
    okResult(await t.act('u2', { type: 'pause', roomId: t.roomId }));
    expect(roomOf(t.rooms, t.roomId).data.paused?.by).toBe(first.playerId);

    const untimed = await lobby(2);
    okResult(await untimed.act('u0', { type: 'settings', roomId: untimed.roomId, settings: { ...DEFAULT_SETTINGS, turnSeconds: null } }));
    okResult(await untimed.act('u0', { type: 'start', roomId: untimed.roomId }));
    expect(await untimed.act('u1', { type: 'pause', roomId: untimed.roomId })).toEqual({
      ok: false,
      error: { code: 'bad-request' },
    });
    expect(await t.act('stranger', { type: 'pause', roomId: t.roomId })).toEqual({
      ok: false,
      error: { code: 'not-a-member' },
    });
  });

  it('the 15 second clock is on the menu', async () => {
    const t = await lobby(2);
    okResult(await t.act('u0', { type: 'settings', roomId: t.roomId, settings: { ...DEFAULT_SETTINGS, turnSeconds: 15 } }));
    okResult(await t.act('u0', { type: 'start', roomId: t.roomId }));
    expect(roomOf(t.rooms, t.roomId).data.turnDeadline).toBe(t.now() + 15_000);
  });
});

describe('chat', () => {
  it('stores messages from members without touching the room', async () => {
    const t = await lobby(2);
    const before = roomOf(t.rooms, t.roomId).version;
    const sent = okResult(await t.act('u1', { type: 'chat', roomId: t.roomId, body: { kind: 'text', text: 'hi' } }));
    expect(t.messages).toEqual([{ roomId: t.roomId, playerId: sent.playerId, body: { kind: 'text', text: 'hi' } }]);
    expect(roomOf(t.rooms, t.roomId).version).toBe(before);
  });

  it('throws must hit someone else in the room', async () => {
    const t = await lobby(2);
    const host = roomOf(t.rooms, t.roomId).data.hostPlayerId;
    const guest = roomOf(t.rooms, t.roomId).data.players[1]?.id ?? '';
    okResult(await t.act('u0', { type: 'chat', roomId: t.roomId, body: { kind: 'throw', item: 'egg', targetId: guest } }));
    for (const targetId of [host, 'nobody']) {
      expect(await t.act('u0', { type: 'chat', roomId: t.roomId, body: { kind: 'throw', item: 'pie', targetId } })).toEqual({
        ok: false,
        error: { code: 'bad-request' },
      });
    }
  });

  it('refuses outsiders and players sending too fast', async () => {
    const t = await lobby(2);
    const body = { kind: 'emoji', emoji: '👍' } as const;
    expect(await t.act('stranger', { type: 'chat', roomId: t.roomId, body })).toEqual({
      ok: false,
      error: { code: 'not-a-member' },
    });
    t.refuseMessages(true);
    expect(await t.act('u0', { type: 'chat', roomId: t.roomId, body })).toEqual({
      ok: false,
      error: { code: 'slow-down' },
    });
    expect(t.messages).toEqual([]);
  });
});

describe('lobby controls', () => {
  it('the host adds computer players with a level, named and seated in order', async () => {
    const t = await lobby(2);
    okResult(await t.act('u0', { type: 'add-bot', roomId: t.roomId, level: 'easy' }));
    const players = roomOf(t.rooms, t.roomId).data.players;
    expect(players.map((p) => [p.seat, p.bot])).toEqual([
      [0, null],
      [1, null],
      [2, 'easy'],
    ]);
    expect(await t.act('u1', { type: 'add-bot', roomId: t.roomId, level: 'easy' })).toEqual({
      ok: false,
      error: { code: 'not-host' },
    });
  });

  it('a game can start with the host and computer players only', async () => {
    const t = setup();
    const host = okResult(await t.act('u0', { type: 'create', name: 'Host' }));
    okResult(await t.act('u0', { type: 'add-bot', roomId: host.roomId, level: 'medium' }));
    okResult(await t.act('u0', { type: 'start', roomId: host.roomId }));
    const room = roomOf(t.rooms, host.roomId);
    expect(room.game?.players).toHaveLength(2);
    expect(handsOf(room).map((h) => h.userId)).toEqual(['u0']);
  });

  it('the host removes a player, who loses their seat and membership', async () => {
    const t = await lobby(3);
    const target = roomOf(t.rooms, t.roomId).data.players[1]?.id ?? '';
    okResult(await t.act('u0', { type: 'remove', roomId: t.roomId, playerId: target }));
    const room = roomOf(t.rooms, t.roomId);
    expect(room.data.players.map((p) => [p.name, p.seat])).toEqual([
      ['Host', 0],
      ['P2', 1],
    ]);
    expect(room.members.map((m) => m.userId)).toEqual(['u0', 'u2']);
    expect(await t.act('u2', { type: 'remove', roomId: t.roomId, playerId: room.data.players[0]?.id ?? '' })).toEqual({
      ok: false,
      error: { code: 'not-host' },
    });
  });

  it('leaving the lobby frees the seat, passes the host on, and closes an empty room', async () => {
    const t = await lobby(2);
    okResult(await t.act('u0', { type: 'leave', roomId: t.roomId }));
    let room = roomOf(t.rooms, t.roomId);
    expect(room.data.players.map((p) => p.name)).toEqual(['P1']);
    expect(room.data.hostPlayerId).toBe(room.data.players[0]?.id);
    okResult(await t.act('u1', { type: 'leave', roomId: t.roomId }));
    room = roomOf(t.rooms, t.roomId);
    expect(room.data.status).toBe('finished');
  });

  it('nothing in the lobby can change once the game starts', async () => {
    const t = await lobby(2);
    okResult(await t.act('u0', { type: 'start', roomId: t.roomId }));
    expect(await t.act('u0', { type: 'add-bot', roomId: t.roomId, level: 'easy' })).toEqual({
      ok: false,
      error: { code: 'not-in-lobby' },
    });
  });
});

describe('room settings', () => {
  const custom = {
    rules: {
      hitOnOthers: false,
      skipLosesTurn: true,
      wildDiscard: false,
      nextHandLeader: 'left-of-dealer',
      levelSet: 'first-5',
      everyoneAdvances: true,
    },
    table: 'wood',
    turnSeconds: 60,
  } as const;

  it('only the host can change them, and only in the lobby', async () => {
    const t = await lobby(2);
    expect(await t.act('u1', { type: 'settings', roomId: t.roomId, settings: custom })).toEqual({
      ok: false,
      error: { code: 'not-host' },
    });
    okResult(await t.act('u0', { type: 'settings', roomId: t.roomId, settings: custom }));
    expect(roomOf(t.rooms, t.roomId).data.settings).toEqual(custom);
    okResult(await t.act('u0', { type: 'start', roomId: t.roomId }));
    expect(await t.act('u0', { type: 'settings', roomId: t.roomId, settings: DEFAULT_SETTINGS })).toEqual({
      ok: false,
      error: { code: 'not-in-lobby' },
    });
  });

  it('the game plays by the chosen rules and clock', async () => {
    const t = await lobby(2);
    okResult(await t.act('u0', { type: 'settings', roomId: t.roomId, settings: custom }));
    okResult(await t.act('u0', { type: 'start', roomId: t.roomId }));
    const room = roomOf(t.rooms, t.roomId);
    expect(roomRules(room)).toMatchObject({ allowHitOnOthers: false, allowWildDiscard: false, everyoneAdvances: true });
    expect(roomRules(room).levels).toHaveLength(5);
    expect(room.data.turnDeadline).toBe(t.now() + 60_000);
  });

  it('with the clock off, people have no deadline but computer seats still play', async () => {
    const t = setup();
    const host = okResult(await t.act('u0', { type: 'create', name: 'Host' }));
    okResult(await t.act('u0', { type: 'settings', roomId: host.roomId, settings: { ...DEFAULT_SETTINGS, turnSeconds: null } }));
    okResult(await t.act('u0', { type: 'add-bot', roomId: host.roomId, level: 'easy' }));
    okResult(await t.act('u0', { type: 'start', roomId: host.roomId }));
    const room = roomOf(t.rooms, host.roomId);
    const botUp = room.data.players.find((p) => p.id === room.game?.players[room.game.currentIndex]?.id)?.bot;
    expect(room.data.turnDeadline).toBe(botUp ? t.now() + BOT_TURN_MS : null);
  });
});
