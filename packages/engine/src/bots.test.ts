import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { botMove, handProgress, type BotLevel } from './bots.ts';
import { DEFAULT_RULES } from './config.ts';
import { createRng } from './deck.ts';
import { createGame, startNextHand, type GameState } from './game.ts';
import { getLevel } from './levels.ts';
import { applyMove } from './moves.ts';
import { cards, num, skip, wild } from './test-helpers.ts';
import { publicView } from './view.ts';

const rules = DEFAULT_RULES;
const LEVELS: BotLevel[] = ['easy', 'medium', 'hard'];

const level = (n: number) => {
  const found = getLevel(rules, n);
  if (!found) throw new Error('missing level');
  return found;
};

/** Plays until the hand ends, each seat using its own bot level. Returns the final state. */
const playHand = (start: GameState, seats: Record<string, BotLevel>, seed: number): GameState => {
  const rng = createRng(seed);
  let s = start;
  for (let i = 0; i < 4000 && s.status === 'playing'; i++) {
    const id = s.players[s.currentIndex]?.id ?? '';
    const move = botMove(publicView(s, id), rules, seats[id] ?? 'easy', rng);
    const result = applyMove(s, id, move, rules);
    if (!result.ok) throw new Error(`${seats[id] ?? ''} made an illegal move: ${JSON.stringify(result.error)}`);
    s = result.state;
  }
  return s;
};

describe('handProgress', () => {
  it('is 1 when the level is complete and lower when cards are missing', () => {
    expect(handProgress(cards(5, 5, 5, 9, 9, 9), level(1))).toBe(1);
    expect(handProgress(cards(5, 5, 9, 9, 9, 1), level(1))).toBeLessThan(1);
    expect(handProgress(cards(5, 5, 9, 9, 9, 1), level(1))).toBeGreaterThan(
      handProgress(cards(5, 2, 9, 7, 3, 1), level(1)),
    );
  });

  it('counts wilds toward any group', () => {
    expect(handProgress(cards(5, 5, 'W', 9, 9, 'W'), level(1))).toBe(1);
  });

  it('measures runs by the best window of numbers in a row', () => {
    expect(handProgress(cards(3, 4, 5, 6, 7, 8, 9), level(4))).toBe(1);
    expect(handProgress(cards(3, 4, 5, 9, 10, 11, 12), level(4))).toBeLessThan(1);
  });
});

describe('botMove', () => {
  const view = (hand: ReturnType<typeof cards>, step: GameState['step'], patch: Partial<GameState> = {}) => {
    const base = createGame(['a', 'b', 'c'], rules, 1, 2);
    return publicView(
      {
        ...base,
        currentIndex: 0,
        step,
        ...patch,
        players: (patch.players ?? base.players).map((p, i) => (i === 0 ? { ...p, hand } : p)),
      },
      'a',
    );
  };

  it('every level lays down as soon as it can', () => {
    for (const lvl of LEVELS) {
      expect(botMove(view(cards(5, 5, 5, 9, 9, 9, 1, 2), 'play'), rules, lvl, createRng(1))).toMatchObject({
        type: 'lay-down',
      });
    }
  });

  it('medium and hard keep the cards that build toward the level', () => {
    // Two 5s and two 9s are close to two sets; the lone 1 and 12 are not.
    const hand = cards(5, 5, 9, 9, 1, 12, 7, 3, 11, 2, 4);
    for (const lvl of ['medium', 'hard'] as const) {
      const move = botMove(view(hand, 'play'), rules, lvl, createRng(2));
      expect(move.type).toBe('discard');
      const card = hand.find((c) => move.type === 'discard' && c.id === move.cardId);
      expect(card?.kind === 'number' && [5, 9].includes(card.value)).toBe(false);
    }
  });

  it('medium and hard never throw away a wild while they have other cards', () => {
    const hand = [wild(), ...cards(1, 2, 3, 4, 6, 8, 10, 11, 12, 12)];
    for (const lvl of ['medium', 'hard'] as const) {
      const move = botMove(view(hand, 'play'), rules, lvl, createRng(3));
      expect(move).not.toMatchObject({ cardId: hand[0]?.id });
    }
  });

  it('medium and hard take a discard that completes a set', () => {
    const top = num('blue', 5);
    const hand = cards(5, 5, 9, 9, 9, 1, 12, 7, 3, 11);
    for (const lvl of ['medium', 'hard'] as const) {
      const v = { ...view(hand, 'draw'), discardTop: top };
      expect(botMove(v, rules, lvl, createRng(4))).toEqual({ type: 'draw', source: 'discard' });
    }
  });

  it('hard aims a Skip at the player closest to winning', () => {
    const s = skip();
    const base = createGame(['a', 'b', 'c'], rules, 1, 2);
    const players = base.players.map((p) =>
      p.id === 'c' ? { ...p, laidDown: true, hand: cards(4) } : p.id === 'b' ? { ...p, hand: cards(1, 2, 3, 4, 5, 6) } : p,
    );
    const move = botMove(view([s, ...cards(1, 2, 3)], 'play', { players }), rules, 'hard', createRng(5));
    expect(move).toEqual({ type: 'discard', cardId: s.id, skipTarget: 'c' });
  });

  it('property: every level always makes legal moves', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: 2, max: 6 }), fc.constantFrom(...LEVELS), (seed, n, lvl) => {
        const ids = ['a', 'b', 'c', 'd', 'e', 'f'].slice(0, n);
        const seats = Object.fromEntries(ids.map((id) => [id, lvl]));
        let s = createGame(ids, rules, seed);
        for (let hand = 0; hand < 3 && s.status !== 'game-over'; hand++) {
          s = playHand(s, seats, seed + hand);
          const next = startNextHand(s, rules);
          if (!next.ok) break;
          s = next.state;
        }
      }),
      { numRuns: 30 },
    );
  });

  it('hard wins more hands than easy, and medium wins more than easy', () => {
    const score = (strong: BotLevel) => {
      let strongWins = 0;
      let easyWins = 0;
      for (let seed = 0; seed < 60; seed++) {
        const s = playHand(createGame(['x', 'y'], rules, seed), { x: strong, y: 'easy' }, seed);
        if (s.handWinnerId === 'x') strongWins++;
        if (s.handWinnerId === 'y') easyWins++;
      }
      return { strongWins, easyWins };
    };
    const hard = score('hard');
    const medium = score('medium');
    expect(hard.strongWins).toBeGreaterThan(hard.easyWins * 2);
    expect(medium.strongWins).toBeGreaterThan(medium.easyWins * 2);
  });
});
