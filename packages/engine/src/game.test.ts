import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Card } from './cards.ts';
import { DEFAULT_RULES, type RulesConfig } from './config.ts';
import { createGame, startNextHand, type GameState, type TableGroup } from './game.ts';
import { applyMove, type Move, type MoveResult } from './moves.ts';
import { cards, num, skip, wild } from './test-helpers.ts';
import { validateRun, validateSet } from './validation.ts';

const rules = DEFAULT_RULES;
const ids = (n: number) => ['a', 'b', 'c', 'd', 'e', 'f'].slice(0, n);

const allCards = (s: GameState): Card[] => [
  ...s.drawPile,
  ...s.discardPile,
  ...s.players.flatMap((p) => p.hand),
  ...s.table.flatMap((g) => g.group.cards),
];

interface Rig {
  hands?: Card[][];
  levels?: number[];
  laidDown?: boolean[];
  skipPending?: boolean[];
  current?: number;
  step?: GameState['step'];
  drawPile?: Card[];
  discardPile?: Card[];
  table?: TableGroup[];
}

/** A 3-player game in a hand-made position. */
const rig = (patch: Rig, players = 3): GameState => {
  const base = createGame(ids(players), rules, 1);
  return {
    ...base,
    players: base.players.map((p, i) => ({
      ...p,
      hand: patch.hands?.[i] ?? cards(1, 2),
      level: patch.levels?.[i] ?? 1,
      laidDown: patch.laidDown?.[i] ?? false,
      skipPending: patch.skipPending?.[i] ?? false,
    })),
    currentIndex: patch.current ?? 0,
    step: patch.step ?? 'play',
    drawPile: patch.drawPile ?? cards(5, 6, 7),
    discardPile: patch.discardPile ?? cards(9),
    table: patch.table ?? [],
  };
};

const ok = (result: MoveResult): GameState => {
  if (!result.ok) throw new Error(`move failed: ${JSON.stringify(result.error)}`);
  return result.state;
};

const play = (state: GameState, player: string, move: Move, config: RulesConfig = rules) =>
  applyMove(state, player, move, config);

const tableGroup = (id: string, ownerId: string, group: Card[], type: 'set' | 'run'): TableGroup => {
  const result = type === 'set' ? validateSet(group, 0, rules) : validateRun(group, 0, rules);
  if (!result.ok) throw new Error('bad table group');
  return { id, ownerId, group: result.group };
};

describe('createGame', () => {
  it('deals 10 cards each and flips one discard', () => {
    const s = createGame(ids(4), rules, 123);
    for (const p of s.players) expect(p.hand).toHaveLength(10);
    expect(s.discardPile).toHaveLength(1);
    expect(s.drawPile).toHaveLength(108 - 40 - 1);
  });

  it('starts everyone on level 1 with 0 points', () => {
    const s = createGame(ids(3), rules, 5);
    expect(s.players.map((p) => [p.level, p.score, p.laidDown])).toEqual([
      [1, 0, false],
      [1, 0, false],
      [1, 0, false],
    ]);
    expect(s).toMatchObject({ status: 'playing', step: 'draw', handNumber: 1, winnerId: null });
  });

  it('starts with the player left of the dealer', () => {
    const noSkipSeed = findSeed((s) => s.discardPile[0]?.kind !== 'skip');
    expect(createGame(ids(4), rules, noSkipSeed, 0).currentIndex).toBe(1);
    expect(createGame(ids(4), rules, noSkipSeed, 3).currentIndex).toBe(0);
  });

  it('skips the first player when the first discard is a Skip (rule sheet)', () => {
    const seed = findSeed((s) => s.discardPile[0]?.kind === 'skip');
    const s = createGame(ids(4), rules, seed, 0);
    expect(s.currentIndex).toBe(2);
    expect(s.players.every((p) => !p.skipPending)).toBe(true);
  });

  it('is reproducible from the seed', () => {
    expect(createGame(ids(3), rules, 77)).toEqual(createGame(ids(3), rules, 77));
  });

  it('rejects fewer than 2 or more than 6 players, and duplicate ids', () => {
    expect(() => createGame(['a'], rules, 1)).toThrow(RangeError);
    expect(() => createGame(['a', 'b', 'c', 'd', 'e', 'f', 'g'], rules, 1)).toThrow(RangeError);
    expect(() => createGame(['a', 'a'], rules, 1)).toThrow(RangeError);
  });

  it('property: every deal holds exactly the 108 cards, each once', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: 2, max: 6 }), (seed, n) => {
        const all = allCards(createGame(ids(n), rules, seed));
        expect(all).toHaveLength(108);
        expect(new Set(all.map((c) => c.id)).size).toBe(108);
      }),
    );
  });
});

const findSeed = (predicate: (s: GameState) => boolean): number => {
  for (let seed = 0; seed < 10000; seed++) {
    if (predicate(createGame(ids(4), rules, seed, 0))) return seed;
  }
  throw new Error('no seed found');
};

describe('turn checks', () => {
  it('rejects moves from a player whose turn it is not', () => {
    expect(play(rig({ step: 'draw' }), 'b', { type: 'draw', source: 'deck' })).toEqual({
      ok: false,
      error: { code: 'not-your-turn' },
    });
  });

  it('rejects unknown players', () => {
    expect(play(rig({}), 'zz', { type: 'draw', source: 'deck' })).toEqual({
      ok: false,
      error: { code: 'unknown-player' },
    });
  });

  it('requires drawing before anything else', () => {
    const s = rig({ step: 'draw', hands: [cards(1, 2)] });
    const cardId = s.players[0]?.hand[0]?.id ?? '';
    expect(play(s, 'a', { type: 'discard', cardId })).toEqual({
      ok: false,
      error: { code: 'must-draw-first' },
    });
  });

  it('allows only one draw per turn', () => {
    expect(play(rig({ step: 'play' }), 'a', { type: 'draw', source: 'deck' })).toEqual({
      ok: false,
      error: { code: 'already-drew' },
    });
  });
});

describe('draw', () => {
  it('takes the top of the draw pile', () => {
    const drawPile = cards(5, 6, 7);
    const s = ok(play(rig({ step: 'draw', drawPile }), 'a', { type: 'draw', source: 'deck' }));
    expect(s.players[0]?.hand.at(-1)).toBe(drawPile[2]);
    expect(s.drawPile).toHaveLength(2);
    expect(s.step).toBe('play');
  });

  it('takes the top discard', () => {
    const discardPile = cards(3, 4);
    const s = ok(play(rig({ step: 'draw', discardPile }), 'a', { type: 'draw', source: 'discard' }));
    expect(s.players[0]?.hand.at(-1)).toBe(discardPile[1]);
    expect(s.discardPile).toEqual([discardPile[0]]);
  });

  it('can take a Wild from the discard pile', () => {
    const s = rig({ step: 'draw', discardPile: [wild()] });
    expect(play(s, 'a', { type: 'draw', source: 'discard' }).ok).toBe(true);
  });

  it('never takes a Skip from the discard pile', () => {
    const s = rig({ step: 'draw', discardPile: [skip()] });
    expect(play(s, 'a', { type: 'draw', source: 'discard' })).toEqual({
      ok: false,
      error: { code: 'cannot-take-skip' },
    });
  });

  it('rejects taking from an empty discard pile', () => {
    const s = rig({ step: 'draw', discardPile: [] });
    expect(play(s, 'a', { type: 'draw', source: 'discard' })).toEqual({
      ok: false,
      error: { code: 'discard-empty' },
    });
  });

  it('reshuffles the discard pile except its top card when the draw pile is empty', () => {
    const discardPile = cards(1, 2, 3, 4);
    const top = discardPile[3];
    const s = ok(
      play(rig({ step: 'draw', drawPile: [], discardPile }), 'a', { type: 'draw', source: 'deck' }),
    );
    expect(s.discardPile).toEqual([top]);
    expect(s.drawPile).toHaveLength(2);
    const drawn = s.players[0]?.hand.at(-1);
    expect(discardPile.slice(0, 3)).toContain(drawn);
  });

  it('draws the last discard when it is the only card left, even a Skip', () => {
    const last = skip();
    const s = ok(
      play(rig({ step: 'draw', drawPile: [], discardPile: [last] }), 'a', {
        type: 'draw',
        source: 'deck',
      }),
    );
    expect(s.players[0]?.hand.at(-1)).toBe(last);
    expect(s.discardPile).toEqual([]);
  });

  it('reports an empty draw pile only when both piles are empty', () => {
    const s = rig({ step: 'draw', drawPile: [], discardPile: [] });
    expect(play(s, 'a', { type: 'draw', source: 'deck' })).toEqual({
      ok: false,
      error: { code: 'draw-pile-empty' },
    });
  });
});

describe('lay-down', () => {
  const hand = cards(5, 5, 5, 7, 7, 7, 2, 9);
  const groupIds = [hand.slice(0, 3).map((c) => c.id), hand.slice(3, 6).map((c) => c.id)];

  it('moves the level onto the table and marks the player', () => {
    const s = ok(play(rig({ hands: [hand] }), 'a', { type: 'lay-down', groups: groupIds }));
    expect(s.players[0]?.hand).toEqual(hand.slice(6));
    expect(s.players[0]?.laidDown).toBe(true);
    expect(s.table).toHaveLength(2);
    expect(s.table.every((g) => g.ownerId === 'a')).toBe(true);
    expect(new Set(s.table.map((g) => g.id)).size).toBe(2);
    expect(s.currentIndex).toBe(0);
  });

  it('keeps run cards in the order given', () => {
    const runHand = cards(8, 8, 8, 'W', 3, 4, 6, 1);
    const s = ok(
      play(rig({ hands: [runHand], levels: [2] }), 'a', {
        type: 'lay-down',
        groups: [runHand.slice(0, 3).map((c) => c.id), [4, 5, 3, 6].map((i) => runHand[i]?.id ?? '')],
      }),
    );
    expect(s.table[1]?.group).toMatchObject({ type: 'run', start: 3, end: 6 });
  });

  it('rejects a lay-down that does not meet the level, leaving state unchanged', () => {
    const s = rig({ hands: [hand], levels: [2] });
    expect(play(s, 'a', { type: 'lay-down', groups: groupIds })).toEqual({
      ok: false,
      error: { code: 'level-invalid', error: { code: 'group-invalid', index: 1, error: 'too-small' } },
    });
  });

  it('rejects cards not in hand', () => {
    expect(
      play(rig({ hands: [hand] }), 'a', { type: 'lay-down', groups: [['nope'], groupIds[1] ?? []] }),
    ).toEqual({ ok: false, error: { code: 'card-not-in-hand' } });
  });

  it('allows only one lay-down per hand', () => {
    const s = rig({ hands: [hand], laidDown: [true] });
    expect(play(s, 'a', { type: 'lay-down', groups: groupIds })).toEqual({
      ok: false,
      error: { code: 'already-laid-down' },
    });
  });
});

describe('hit', () => {
  const othersSet = () => tableGroup('g1', 'b', cards(4, 4, 4), 'set');

  it('requires your own level to be down first (rule sheet)', () => {
    const extra = num('red', 4);
    const s = rig({ hands: [[extra, num('red', 9)]], table: [othersSet()] });
    expect(play(s, 'a', { type: 'hit', groupId: 'g1', cardId: extra.id })).toEqual({
      ok: false,
      error: { code: 'must-lay-down-first' },
    });
  });

  it("hits on another player's group", () => {
    const extra = num('red', 4);
    const s = rig({ hands: [[extra, num('red', 9)]], laidDown: [true], table: [othersSet()] });
    const next = ok(play(s, 'a', { type: 'hit', groupId: 'g1', cardId: extra.id }));
    expect(next.table[0]?.group.cards).toHaveLength(4);
    expect(next.table[0]?.ownerId).toBe('b');
    expect(next.players[0]?.hand).toHaveLength(1);
  });

  it("blocks hits on others' groups when the house rule turns them off", () => {
    const extra = num('red', 4);
    const s = rig({ hands: [[extra, num('red', 9)]], laidDown: [true], table: [othersSet()] });
    const ownOnly = { ...rules, allowHitOnOthers: false };
    expect(play(s, 'a', { type: 'hit', groupId: 'g1', cardId: extra.id }, ownOnly)).toEqual({
      ok: false,
      error: { code: 'cannot-hit-others' },
    });
  });

  it('passes on the reason a card does not fit', () => {
    const wrong = num('red', 5);
    const s = rig({ hands: [[wrong, num('red', 9)]], laidDown: [true], table: [othersSet()] });
    expect(play(s, 'a', { type: 'hit', groupId: 'g1', cardId: wrong.id })).toEqual({
      ok: false,
      error: { code: 'hit-invalid', error: 'mixed-numbers' },
    });
  });

  it('places a wild at the chosen end of a run', () => {
    const w = wild();
    const run = tableGroup('g1', 'a', cards(3, 4, 5, 6), 'run');
    const s = rig({ hands: [[w, num('red', 9)]], laidDown: [true], table: [run] });
    expect(play(s, 'a', { type: 'hit', groupId: 'g1', cardId: w.id })).toEqual({
      ok: false,
      error: { code: 'hit-invalid', error: 'needs-position' },
    });
    const next = ok(play(s, 'a', { type: 'hit', groupId: 'g1', cardId: w.id, position: 'end' }));
    expect(next.table[0]?.group).toMatchObject({ start: 3, end: 7 });
  });

  it('rejects an unknown group', () => {
    const extra = num('red', 4);
    const s = rig({ hands: [[extra]], laidDown: [true], table: [othersSet()] });
    expect(play(s, 'a', { type: 'hit', groupId: 'nope', cardId: extra.id })).toEqual({
      ok: false,
      error: { code: 'group-not-found' },
    });
  });
});

describe('discard', () => {
  it('moves the card to the discard pile and passes the turn', () => {
    const hand = cards(3, 8);
    const s = ok(play(rig({ hands: [hand] }), 'a', { type: 'discard', cardId: hand[1]?.id ?? '' }));
    expect(s.discardPile.at(-1)).toBe(hand[1]);
    expect(s.players[0]?.hand).toEqual([hand[0]]);
    expect(s).toMatchObject({ currentIndex: 1, step: 'draw' });
  });

  it('wraps turn order around the table', () => {
    const hand = cards(3, 8);
    const s = ok(
      play(rig({ hands: [[], [], hand], current: 2 }), 'c', {
        type: 'discard',
        cardId: hand[0]?.id ?? '',
      }),
    );
    expect(s.currentIndex).toBe(0);
  });

  it('allows discarding a Wild by default and blocks it under the house rule', () => {
    const w = wild();
    const s = rig({ hands: [[w, num('red', 2)]] });
    expect(play(s, 'a', { type: 'discard', cardId: w.id }).ok).toBe(true);
    expect(play(s, 'a', { type: 'discard', cardId: w.id }, { ...rules, allowWildDiscard: false })).toEqual({
      ok: false,
      error: { code: 'cannot-discard-wild' },
    });
  });

  it('rejects a card not in hand', () => {
    expect(play(rig({}), 'a', { type: 'discard', cardId: 'nope' })).toEqual({
      ok: false,
      error: { code: 'card-not-in-hand' },
    });
  });
});

describe('skips', () => {
  const skipHand = () => {
    const s = skip();
    return { card: s, hand: [s, num('red', 2)] };
  };

  it('needs a target', () => {
    const { card, hand } = skipHand();
    expect(play(rig({ hands: [hand] }), 'a', { type: 'discard', cardId: card.id })).toEqual({
      ok: false,
      error: { code: 'skip-target-required' },
    });
  });

  it('makes the chosen player lose their next turn', () => {
    const { card, hand } = skipHand();
    const s = ok(
      play(rig({ hands: [hand] }), 'a', { type: 'discard', cardId: card.id, skipTarget: 'b' }),
    );
    expect(s.currentIndex).toBe(2);
    expect(s.players[1]?.skipPending).toBe(false);
  });

  it('can target a player who is not next', () => {
    const { card, hand } = skipHand();
    const s = ok(
      play(rig({ hands: [hand] }), 'a', { type: 'discard', cardId: card.id, skipTarget: 'c' }),
    );
    expect(s.currentIndex).toBe(1);
    expect(s.players[2]?.skipPending).toBe(true);
  });

  it('cannot target yourself', () => {
    const { card, hand } = skipHand();
    expect(
      play(rig({ hands: [hand] }), 'a', { type: 'discard', cardId: card.id, skipTarget: 'a' }),
    ).toEqual({ ok: false, error: { code: 'invalid-skip-target' } });
  });

  it('does not stack: a player with a skip pending cannot be chosen again', () => {
    const { card, hand } = skipHand();
    const s = rig({ hands: [hand], skipPending: [false, false, true] });
    expect(play(s, 'a', { type: 'discard', cardId: card.id, skipTarget: 'c' })).toEqual({
      ok: false,
      error: { code: 'invalid-skip-target' },
    });
  });

  it('with 2 players, the discarder plays again right away', () => {
    const { card, hand } = skipHand();
    const s = ok(
      play(rig({ hands: [hand] }, 2), 'a', { type: 'discard', cardId: card.id, skipTarget: 'b' }),
    );
    expect(s).toMatchObject({ currentIndex: 0, step: 'draw' });
  });

  it('has no effect and needs no target when skipLosesTurn is off', () => {
    const { card, hand } = skipHand();
    const noSkips = { ...rules, skipLosesTurn: false };
    const s = ok(play(rig({ hands: [hand] }), 'a', { type: 'discard', cardId: card.id }, noSkips));
    expect(s.currentIndex).toBe(1);
  });
});

describe('going out and ending the hand', () => {
  it('ends the hand when the last card is discarded, scoring the others', () => {
    const last = num('red', 3);
    const s = ok(
      play(
        rig({
          hands: [[last], [num('red', 11), wild()], [skip()]],
          laidDown: [true, true, false],
        }),
        'a',
        { type: 'discard', cardId: last.id },
      ),
    );
    expect(s).toMatchObject({ status: 'hand-over', handWinnerId: 'a', winnerId: null });
    expect(s.players.map((p) => p.score)).toEqual([0, 35, 15]);
    expect(s.players.map((p) => p.level)).toEqual([2, 2, 1]);
  });

  it('needs no skip target when going out on a Skip', () => {
    const last = skip();
    const s = ok(play(rig({ hands: [[last]], laidDown: [true] }), 'a', { type: 'discard', cardId: last.id }));
    expect(s.status).toBe('hand-over');
  });

  it('ends the hand when the last card is hit (rule sheet: by discarding or hitting)', () => {
    const last = num('red', 4);
    const s = rig({
      hands: [[last]],
      laidDown: [true],
      table: [tableGroup('g1', 'a', cards(4, 4, 4), 'set')],
    });
    expect(ok(play(s, 'a', { type: 'hit', groupId: 'g1', cardId: last.id }))).toMatchObject({
      status: 'hand-over',
      handWinnerId: 'a',
    });
  });

  it('ends the hand when a lay-down uses every card', () => {
    const hand = cards(5, 5, 5, 5, 5, 5, 7, 7, 7, 7, 7);
    const s = ok(
      play(rig({ hands: [hand] }), 'a', {
        type: 'lay-down',
        groups: [hand.slice(0, 6).map((c) => c.id), hand.slice(6).map((c) => c.id)],
      }),
    );
    expect(s).toMatchObject({ status: 'hand-over', handWinnerId: 'a' });
  });

  it('rejects moves once the hand is over', () => {
    const last = num('red', 3);
    const s = ok(play(rig({ hands: [[last]], laidDown: [true] }), 'a', { type: 'discard', cardId: last.id }));
    expect(play(s, 'b', { type: 'draw', source: 'deck' })).toEqual({
      ok: false,
      error: { code: 'game-not-active' },
    });
  });
});

describe('winning (house rule: go out on level 10)', () => {
  it('wins the game by going out on level 10', () => {
    const last = num('red', 3);
    const s = ok(
      play(rig({ hands: [[last], [num('red', 2)], [num('red', 2)]], levels: [10, 10, 4], laidDown: [true, true, false] }), 'a', {
        type: 'discard',
        cardId: last.id,
      }),
    );
    expect(s).toMatchObject({ status: 'game-over', winnerId: 'a', handWinnerId: 'a' });
    expect(s.players.map((p) => p.level)).toEqual([10, 10, 4]);
  });

  it('does not win by laying level 10 if someone else goes out first', () => {
    const last = num('red', 3);
    const s = ok(
      play(rig({ hands: [[last], [num('red', 2)]], levels: [7, 10], laidDown: [true, true] }), 'a', {
        type: 'discard',
        cardId: last.id,
      }),
    );
    expect(s).toMatchObject({ status: 'hand-over', winnerId: null });
    expect(s.players.map((p) => p.level)).toEqual([8, 10, 1]);
  });
});

describe('startNextHand', () => {
  const finished = () => {
    const last = num('red', 3);
    return ok(
      play(rig({ hands: [[last], [wild()]], laidDown: [true] }), 'a', {
        type: 'discard',
        cardId: last.id,
      }),
    );
  };

  it('deals a fresh hand, rotates the dealer, and keeps levels and scores', () => {
    const before = finished();
    const s = ok(startNextHand(before, rules));
    expect(s).toMatchObject({ status: 'playing', handNumber: 2, dealerIndex: 1, table: [] });
    expect(s.players.map((p) => [p.level, p.score, p.laidDown])).toEqual([
      [2, 0, false],
      [1, 25, false],
      [1, 10, false],
    ]);
    expect(s.players.every((p) => p.hand.length === 10)).toBe(true);
    expect(allCards(s)).toHaveLength(108);
  });

  it('only runs after a hand is over', () => {
    expect(startNextHand(rig({}), rules)).toEqual({ ok: false, error: { code: 'hand-not-over' } });
  });
});

describe('property: random legal play', () => {
  it('always keeps 108 unique cards and a valid turn', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: 2, max: 6 }), fc.array(fc.nat(), { maxLength: 200 }), (seed, n, picks) => {
        let s = createGame(ids(n), rules, seed);
        for (const pick of picks) {
          if (s.status !== 'playing') break;
          const player = s.players[s.currentIndex];
          if (!player) throw new Error('bad current index');
          const move: Move =
            s.step === 'draw'
              ? { type: 'draw', source: pick % 2 === 0 ? 'deck' : 'discard' }
              : discardMove(s, pick);
          const result = play(s, player.id, move);
          if (result.ok) s = result.state;
          else if (s.step === 'draw') s = ok(play(s, player.id, { type: 'draw', source: 'deck' }));
          else throw new Error(JSON.stringify(result.error));
          const all = allCards(s);
          expect(all).toHaveLength(108);
          expect(new Set(all.map((c) => c.id)).size).toBe(108);
        }
      }),
      { numRuns: 50 },
    );
  });
});

const discardMove = (s: GameState, pick: number): Move => {
  const me = s.players[s.currentIndex];
  const hand = me?.hand ?? [];
  const card = hand[pick % hand.length];
  if (!card) throw new Error('empty hand');
  if (card.kind !== 'skip' || hand.length === 1) return { type: 'discard', cardId: card.id };
  const target = s.players.find((p) => p.id !== me?.id && !p.skipPending);
  return target
    ? { type: 'discard', cardId: card.id, skipTarget: target.id }
    : { type: 'discard', cardId: card.id };
};
