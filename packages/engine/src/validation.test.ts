import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { COLORS, MAX_VALUE, MIN_VALUE, type Card } from './cards.ts';
import { DEFAULT_RULES, type RulesConfig } from './config.ts';
import { getLevel } from './levels.ts';
import { cards, num, skip, wild } from './test-helpers.ts';
import {
  arrangeRun,
  validateColorGroup,
  validateGroup,
  validateLevel,
  validateRun,
  validateSet,
} from './validation.ts';

const rules = DEFAULT_RULES;
const noNaturalRule: RulesConfig = { ...DEFAULT_RULES, requireNaturalCard: false };

const level = (n: number) => {
  const found = getLevel(rules, n);
  if (!found) throw new Error(`missing level ${String(n)}`);
  return found;
};

describe('validateSet', () => {
  it('accepts matching numbers in any colors', () => {
    const result = validateSet([num('red', 7), num('blue', 7), num('green', 7)], 3, rules);
    expect(result).toMatchObject({ ok: true, group: { type: 'set', value: 7 } });
  });

  it('accepts wilds alongside at least one natural', () => {
    expect(validateSet(cards(9, 'W', 'W'), 3, rules)).toMatchObject({
      ok: true,
      group: { value: 9 },
    });
  });

  it('accepts more cards than the minimum', () => {
    expect(validateSet(cards(4, 4, 4, 4, 'W'), 3, rules).ok).toBe(true);
  });

  it('rejects too few cards', () => {
    expect(validateSet(cards(5, 5), 3, rules)).toEqual({ ok: false, error: 'too-small' });
  });

  it('rejects mixed numbers', () => {
    expect(validateSet(cards(5, 5, 6), 3, rules)).toEqual({ ok: false, error: 'mixed-numbers' });
  });

  it('rejects all wilds by default', () => {
    expect(validateSet(cards('W', 'W', 'W'), 3, rules)).toEqual({
      ok: false,
      error: 'no-natural',
    });
  });

  it('allows all wilds when the house rule turns off the natural requirement', () => {
    expect(validateSet(cards('W', 'W', 'W'), 3, noNaturalRule)).toMatchObject({
      ok: true,
      group: { type: 'set', value: null },
    });
  });

  it('rejects skips', () => {
    expect(validateSet(cards(5, 5, 'S'), 3, rules)).toEqual({ ok: false, error: 'contains-skip' });
  });

  it('property: any set of one number with any wilds validates', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: MIN_VALUE, max: MAX_VALUE }),
        fc.array(fc.constantFrom(...COLORS), { minLength: 1, maxLength: 8 }),
        fc.integer({ min: 0, max: 8 }),
        (value, colors, wilds) => {
          const group: Card[] = [
            ...colors.map((c) => num(c, value)),
            ...Array.from({ length: wilds }, wild),
          ];
          const result = validateSet(group, group.length, rules);
          expect(result).toMatchObject({ ok: true, group: { value } });
        },
      ),
    );
  });
});

describe('validateRun', () => {
  it('accepts consecutive numbers in any colors', () => {
    const result = validateRun(
      [num('red', 3), num('blue', 4), num('green', 5), num('yellow', 6)],
      4,
      rules,
    );
    expect(result).toMatchObject({ ok: true, group: { type: 'run', start: 3, end: 6 } });
  });

  it('uses a wild to fill a gap (rule sheet example: 3, 4, W as 5, 6)', () => {
    expect(validateRun(cards(3, 4, 'W', 6), 4, rules)).toMatchObject({
      ok: true,
      group: { start: 3, end: 6 },
    });
  });

  it('uses wilds at either end', () => {
    expect(validateRun(cards('W', 5, 6, 'W'), 4, rules)).toMatchObject({
      ok: true,
      group: { start: 4, end: 7 },
    });
  });

  it('accepts the full 1 to 12 run', () => {
    const full = cards(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12);
    expect(validateRun(full, 9, rules)).toMatchObject({ ok: true, group: { start: 1, end: 12 } });
  });

  it('rejects cards out of order', () => {
    expect(validateRun(cards(3, 5, 4, 6), 4, rules)).toEqual({
      ok: false,
      error: 'not-in-sequence',
    });
  });

  it('rejects a gap with no wild', () => {
    expect(validateRun(cards(3, 4, 6, 7), 4, rules)).toEqual({
      ok: false,
      error: 'not-in-sequence',
    });
  });

  it('rejects duplicate numbers', () => {
    expect(validateRun(cards(3, 4, 4, 5), 4, rules)).toEqual({
      ok: false,
      error: 'not-in-sequence',
    });
  });

  it('does not wrap from 12 to 1', () => {
    expect(validateRun(cards(11, 12, 1, 2), 4, rules)).toEqual({
      ok: false,
      error: 'not-in-sequence',
    });
  });

  it('rejects a wild that would sit below 1', () => {
    expect(validateRun(cards('W', 1, 2, 3), 4, rules)).toEqual({
      ok: false,
      error: 'out-of-range',
    });
  });

  it('rejects a wild that would sit above 12', () => {
    expect(validateRun(cards(10, 11, 12, 'W'), 4, rules)).toEqual({
      ok: false,
      error: 'out-of-range',
    });
  });

  it('rejects too few cards', () => {
    expect(validateRun(cards(1, 2, 3), 4, rules)).toEqual({ ok: false, error: 'too-small' });
  });

  it('rejects all wilds by default', () => {
    expect(validateRun(cards('W', 'W', 'W', 'W'), 4, rules)).toEqual({
      ok: false,
      error: 'no-natural',
    });
  });

  it('rejects skips', () => {
    expect(validateRun(cards(1, 2, 'S', 4), 4, rules)).toEqual({
      ok: false,
      error: 'contains-skip',
    });
  });

  it('property: any legal run with wilds validates at its start', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 12 }).chain((length) =>
          fc.record({
            length: fc.constant(length),
            start: fc.integer({ min: MIN_VALUE, max: MAX_VALUE - length + 1 }),
            wildMask: fc.array(fc.boolean(), { minLength: length, maxLength: length }),
            naturalAt: fc.integer({ min: 0, max: length - 1 }),
            color: fc.constantFrom(...COLORS),
          }),
        ),
        ({ length, start, wildMask, naturalAt, color }) => {
          const run = wildMask.map((isWild, i) =>
            isWild && i !== naturalAt ? wild() : num(color, start + i),
          );
          expect(validateRun(run, length, rules)).toMatchObject({
            ok: true,
            group: { start, end: start + length - 1 },
          });
        },
      ),
    );
  });
});

describe('arrangeRun', () => {
  it('orders loose cards into a run', () => {
    const arrangements = arrangeRun(cards(6, 4, 3, 5), rules);
    expect(arrangements).toHaveLength(1);
    expect(arrangements[0]?.map((c) => (c.kind === 'number' ? c.value : 'W'))).toEqual([
      3, 4, 5, 6,
    ]);
  });

  it('returns each possible placement when wilds make it ambiguous', () => {
    const arrangements = arrangeRun(cards(5, 'W', 4, 3), rules);
    const shapes = arrangements.map((a) => a.map((c) => (c.kind === 'number' ? c.value : 'W')));
    expect(shapes).toEqual([
      ['W', 3, 4, 5],
      [3, 4, 5, 'W'],
    ]);
  });

  it('returns nothing for duplicate numbers or skips', () => {
    expect(arrangeRun(cards(3, 3, 4, 5), rules)).toEqual([]);
    expect(arrangeRun(cards(3, 4, 5, 'S'), rules)).toEqual([]);
  });

  it('returns nothing when the numbers span too wide', () => {
    expect(arrangeRun(cards(1, 2, 3, 12), rules)).toEqual([]);
  });

  it('property: every arrangement of shuffled legal run cards validates', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 12 }).chain((length) =>
          fc.record({
            length: fc.constant(length),
            start: fc.integer({ min: MIN_VALUE, max: MAX_VALUE - length + 1 }),
            wildMask: fc.array(fc.boolean(), { minLength: length, maxLength: length }),
            order: fc.array(fc.nat(), { minLength: length, maxLength: length }),
          }),
        ),
        ({ length, start, wildMask, order }) => {
          const run = wildMask.map((isWild, i) =>
            isWild && i !== 0 ? wild() : num('blue', start + i),
          );
          const loose = run
            .map((card, i) => ({ card, key: order[i] ?? 0 }))
            .sort((a, b) => a.key - b.key)
            .map((x) => x.card);
          const arrangements = arrangeRun(loose, rules);
          expect(arrangements.length).toBeGreaterThan(0);
          for (const arrangement of arrangements) {
            expect(validateRun(arrangement, length, rules).ok).toBe(true);
          }
        },
      ),
    );
  });
});

describe('validateColorGroup', () => {
  it('accepts 7 cards of one color in any order (rule sheet example)', () => {
    const group = [12, 1, 7, 7, 3, 9, 2].map((v) => num('green', v));
    expect(validateColorGroup(group, 7, rules)).toMatchObject({
      ok: true,
      group: { type: 'color', color: 'green' },
    });
  });

  it('accepts wilds as the color', () => {
    const group = [...[1, 2, 3, 4, 5, 6].map((v) => num('green', v)), wild()];
    expect(validateColorGroup(group, 7, rules).ok).toBe(true);
  });

  it('rejects mixed colors', () => {
    const group = [...[1, 2, 3, 4, 5, 6].map((v) => num('green', v)), num('red', 7)];
    expect(validateColorGroup(group, 7, rules)).toEqual({ ok: false, error: 'mixed-colors' });
  });

  it('rejects skips (rule sheet: never used in the color level)', () => {
    const group = [...[1, 2, 3, 4, 5, 6].map((v) => num('green', v)), skip()];
    expect(validateColorGroup(group, 7, rules)).toEqual({ ok: false, error: 'contains-skip' });
  });

  it('rejects all wilds by default', () => {
    const group = Array.from({ length: 7 }, wild);
    expect(validateColorGroup(group, 7, rules)).toEqual({ ok: false, error: 'no-natural' });
  });

  it('rejects too few cards', () => {
    const group = [1, 2, 3].map((v) => num('green', v));
    expect(validateColorGroup(group, 7, rules)).toEqual({ ok: false, error: 'too-small' });
  });

  it('property: any one-color group with wilds validates; one off-color card breaks it', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...COLORS),
        fc.array(fc.integer({ min: MIN_VALUE, max: MAX_VALUE }), { minLength: 1, maxLength: 12 }),
        fc.integer({ min: 0, max: 8 }),
        (color, values, wilds) => {
          const group: Card[] = [
            ...values.map((v) => num(color, v)),
            ...Array.from({ length: wilds }, wild),
          ];
          expect(validateColorGroup(group, group.length, rules).ok).toBe(true);
          const other = COLORS.find((c) => c !== color) ?? color;
          expect(validateColorGroup([...group, num(other, 1)], group.length, rules)).toEqual({
            ok: false,
            error: 'mixed-colors',
          });
        },
      ),
    );
  });
});

describe('validateGroup', () => {
  it('dispatches on the requirement type', () => {
    expect(validateGroup({ type: 'set', size: 3 }, cards(2, 2, 2), rules).ok).toBe(true);
    expect(validateGroup({ type: 'run', size: 3 }, cards(2, 2, 2), rules).ok).toBe(false);
    expect(validateGroup({ type: 'run', size: 4 }, cards(1, 2, 3, 4), rules).ok).toBe(true);
    expect(validateGroup({ type: 'color', size: 4 }, cards(1, 2, 3, 4), rules).ok).toBe(true);
  });
});

describe('validateLevel', () => {
  it('accepts level 1 with two sets of three (rule sheet example: three 5s and three 7s)', () => {
    const result = validateLevel(level(1), [cards(5, 5, 5), cards(7, 7, 7)], rules);
    expect(result).toMatchObject({
      ok: true,
      groups: [
        { type: 'set', value: 5 },
        { type: 'set', value: 7 },
      ],
    });
  });

  it('accepts two sets of the same number (rule sheet: three 10s and three more 10s)', () => {
    expect(validateLevel(level(1), [cards(10, 10, 10), cards(10, 10, 10)], rules).ok).toBe(true);
  });

  it('accepts level 2 with a set and a run using wilds', () => {
    const result = validateLevel(level(2), [cards(8, 8, 'W'), cards(3, 'W', 5, 6)], rules);
    expect(result).toMatchObject({
      ok: true,
      groups: [
        { type: 'set', value: 8 },
        { type: 'run', start: 3, end: 6 },
      ],
    });
  });

  it('accepts a longer run than required (rule sheet: run of 9 counts for level 4)', () => {
    expect(validateLevel(level(4), [cards(1, 2, 3, 4, 5, 6, 7, 8, 9)], rules).ok).toBe(true);
  });

  it('accepts level 8 with seven cards of one color', () => {
    const group = [1, 1, 4, 6, 9, 11, 12].map((v) => num('yellow', v));
    expect(validateLevel(level(8), [group], rules).ok).toBe(true);
  });

  it('accepts level 9 and level 10', () => {
    expect(validateLevel(level(9), [cards(6, 6, 6, 6, 'W'), cards(2, 2)], rules).ok).toBe(true);
    expect(validateLevel(level(10), [cards(6, 6, 6, 'W', 'W'), cards(1, 'W', 1)], rules).ok).toBe(
      true,
    );
  });

  it('matches groups to requirements in order', () => {
    expect(validateLevel(level(9), [cards(2, 2), cards(6, 6, 6, 6, 6)], rules)).toEqual({
      ok: false,
      error: { code: 'group-invalid', index: 0, error: 'too-small' },
    });
  });

  it('rejects the wrong number of groups (rule sheet: no third set on level 1)', () => {
    expect(
      validateLevel(level(1), [cards(5, 5, 5), cards(7, 7, 7), cards(10, 10, 10)], rules),
    ).toEqual({ ok: false, error: { code: 'wrong-group-count', expected: 2, actual: 3 } });
    expect(validateLevel(level(1), [cards(5, 5, 5)], rules)).toEqual({
      ok: false,
      error: { code: 'wrong-group-count', expected: 2, actual: 1 },
    });
  });

  it('rejects the same card used twice', () => {
    const shared = num('red', 5);
    const result = validateLevel(
      level(1),
      [
        [shared, num('blue', 5), num('green', 5)],
        [shared, num('blue', 5), num('green', 5)],
      ],
      rules,
    );
    expect(result).toEqual({ ok: false, error: { code: 'duplicate-card', cardId: shared.id } });
  });

  it('reports which group failed and why', () => {
    expect(validateLevel(level(2), [cards(8, 8, 8), cards(1, 2, 4, 5)], rules)).toEqual({
      ok: false,
      error: { code: 'group-invalid', index: 1, error: 'not-in-sequence' },
    });
  });

  it('requires a natural card in every group, not just the level', () => {
    expect(validateLevel(level(1), [cards(5, 5, 5), cards('W', 'W', 'W')], rules)).toEqual({
      ok: false,
      error: { code: 'group-invalid', index: 1, error: 'no-natural' },
    });
  });
});
