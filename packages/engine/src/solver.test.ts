import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Card } from './cards.ts';
import { DEFAULT_RULES } from './config.ts';
import { createDeck, createRng, shuffle } from './deck.ts';
import { getLevel } from './levels.ts';
import { findHits, findLevel } from './solver.ts';
import { cards, num, skip, wild } from './test-helpers.ts';
import { validateLevel, validateRun, validateSet } from './validation.ts';

const rules = DEFAULT_RULES;
const level = (n: number) => {
  const found = getLevel(rules, n);
  if (!found) throw new Error('missing level');
  return found;
};

const expectValid = (n: number, hand: Card[]) => {
  const groups = findLevel(hand, level(n), rules);
  expect(groups).not.toBeNull();
  if (!groups) return;
  expect(validateLevel(level(n), groups, rules).ok).toBe(true);
  const used = groups.flat().map((c) => c.id);
  expect(new Set(used).size).toBe(used.length);
  for (const id of used) expect(hand.some((c) => c.id === id)).toBe(true);
};

describe('findLevel', () => {
  it('finds two sets of three', () => {
    expectValid(1, cards(5, 5, 5, 9, 9, 9, 1, 2, 3, 4, 7));
  });

  it('finds two sets of the same number', () => {
    expectValid(1, cards(5, 5, 5, 5, 5, 5, 1, 2, 3, 4, 7));
  });

  it('uses wilds to fill sets', () => {
    expectValid(1, cards(5, 5, 'W', 9, 'W', 9, 1, 2, 3, 4, 7));
  });

  it('shares a number between a set and a run with a wild', () => {
    // Set of 7s needs all three 7s, so the run 5-8 must use the wild as its 7.
    expectValid(2, cards(7, 7, 7, 5, 6, 'W', 8, 1, 1, 12, 'S'));
  });

  it('finds long runs with wilds in the gaps and at the ends', () => {
    expectValid(4, cards(2, 3, 'W', 5, 6, 'W', 8, 12, 12, 'S', 'S'));
    expectValid(6, cards(4, 5, 6, 'W', 8, 9, 10, 11, 'W', 1, 1));
  });

  it('finds seven of one color', () => {
    const hand = [1, 3, 3, 8, 9, 12].map((v) => num('green', v));
    expectValid(8, [...hand, wild(), num('red', 2), skip(), num('blue', 2), num('red', 9)]);
  });

  it('finds levels 9 and 10', () => {
    expectValid(9, cards(4, 4, 4, 4, 'W', 11, 11, 1, 2, 3, 'S'));
    expectValid(10, cards(4, 4, 4, 'W', 'W', 11, 11, 11, 2, 3, 'S'));
  });

  it('returns null when the level is not in hand', () => {
    expect(findLevel(cards(1, 2, 3, 5, 5, 7, 7, 9, 10, 11, 12), level(1), rules)).toBeNull();
    expect(findLevel(cards(1, 2, 3, 5, 6, 7, 9, 'S', 'S', 11, 12), level(4), rules)).toBeNull();
    expect(findLevel(cards('W', 'W', 'W', 'W', 'W', 'W', 1, 2, 3, 4, 5), level(1), rules)).not.toBeNull();
  });

  it('never builds a group from wilds alone', () => {
    // 2,2,W leaves W,W with no number card; 2,W,W leaves 2,W, one short.
    expect(findLevel(cards('W', 'W', 'W', 2, 2, 'S', 'S', 'S', 'S', 'S', 'S'), level(1), rules)).toBeNull();
  });

  it('property: anything it finds is a valid level made of distinct cards from the hand', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: 1, max: 10 }), (seed, n) => {
        const hand = shuffle(createDeck(), createRng(seed)).slice(0, 11);
        const groups = findLevel(hand, level(n), rules);
        if (!groups) return;
        expect(validateLevel(level(n), groups, rules).ok).toBe(true);
        const used = groups.flat().map((c) => c.id);
        expect(new Set(used).size).toBe(used.length);
      }),
      { numRuns: 400 },
    );
  });

  it('property: always finds a level that was planted in the hand', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 9 }), (seed, a, b) => {
        // Level 1 planted as two natural sets, plus random filler.
        const filler = shuffle(createDeck(), createRng(seed))
          .filter((c) => c.kind !== 'number' || (c.value !== a && c.value !== b))
          .slice(0, 5);
        const hand = [...cards(a, a, a), ...cards(b + (b >= a ? 1 : 0), b + (b >= a ? 1 : 0), b + (b >= a ? 1 : 0)), ...filler];
        expect(findLevel(hand, level(1), rules)).not.toBeNull();
      }),
    );
  });
});

describe('findHits', () => {
  const table = () => {
    const set = validateSet(cards(4, 4, 4), 0, rules);
    const run = validateRun(cards(3, 4, 5, 6), 0, rules);
    if (!set.ok || !run.ok) throw new Error('bad setup');
    return [
      { id: 'g-set', ownerId: 'b', group: set.group },
      { id: 'g-run', ownerId: 'a', group: run.group },
    ];
  };

  it('lists every legal hit for the hand', () => {
    const four = num('red', 4);
    const seven = num('red', 7);
    const hits = findHits([four, seven, num('red', 11), skip()], table(), 'a', rules);
    expect(hits).toEqual([
      { type: 'hit', groupId: 'g-set', cardId: four.id },
      { type: 'hit', groupId: 'g-run', cardId: seven.id },
    ]);
  });

  it('gives a wild a position on an open-ended run', () => {
    const w = wild();
    const hits = findHits([w], table(), 'a', rules);
    expect(hits).toContainEqual({ type: 'hit', groupId: 'g-run', cardId: w.id, position: 'end' });
    expect(hits).toContainEqual({ type: 'hit', groupId: 'g-set', cardId: w.id });
  });

  it("respects the house rule against hitting others' groups", () => {
    const four = num('red', 4);
    expect(findHits([four], table(), 'a', { ...rules, allowHitOnOthers: false })).toEqual([]);
  });
});
