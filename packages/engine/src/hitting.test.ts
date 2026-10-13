import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { COLORS, MAX_VALUE, MIN_VALUE, type Card } from './cards.ts';
import { DEFAULT_RULES, type RulesConfig } from './config.ts';
import { hit } from './hitting.ts';
import { cards, num, skip, wild } from './test-helpers.ts';
import {
  validateColorGroup,
  validateRun,
  validateSet,
  type GroupResult,
  type LaidGroup,
} from './validation.ts';

const rules = DEFAULT_RULES;

const laid = (result: GroupResult): LaidGroup => {
  if (!result.ok) throw new Error(`invalid test group: ${result.error}`);
  return result.group;
};

const setOf = (...specs: (number | 'W')[]) => laid(validateSet(cards(...specs), 0, rules));
const runOf = (...specs: (number | 'W')[]) => laid(validateRun(cards(...specs), 0, rules));
const greens = (...values: number[]) =>
  laid(validateColorGroup(values.map((v) => num('green', v)), 0, rules));

describe('hit on a set', () => {
  it('adds a matching number (rule sheet: more 4s on a set of 4s)', () => {
    const result = hit(setOf(4, 4, 4), num('blue', 4), rules);
    expect(result).toMatchObject({ ok: true, group: { type: 'set', value: 4 } });
    if (result.ok) expect(result.group.cards).toHaveLength(4);
  });

  it('adds a wild', () => {
    expect(hit(setOf(4, 4, 4), wild(), rules).ok).toBe(true);
  });

  it('rejects a different number', () => {
    expect(hit(setOf(4, 4, 4), num('red', 5), rules)).toEqual({
      ok: false,
      error: 'mixed-numbers',
    });
  });

  it('rejects a skip', () => {
    expect(hit(setOf(4, 4, 4), skip(), rules)).toEqual({ ok: false, error: 'contains-skip' });
  });

  it('does not change the original group', () => {
    const group = setOf(4, 4, 4);
    hit(group, num('red', 4), rules);
    expect(group.cards).toHaveLength(3);
  });

  it('gives an all-wild set its number on the first natural hit (house rule)', () => {
    const loose: RulesConfig = { ...rules, requireNaturalCard: false };
    const group = laid(validateSet(cards('W', 'W', 'W'), 0, loose));
    expect(hit(group, num('red', 9), loose)).toMatchObject({ ok: true, group: { value: 9 } });
  });
});

describe('hit on a run', () => {
  it('adds a number below the run (rule sheet: a 2 onto 3, 4, 5, 6)', () => {
    const result = hit(runOf(3, 4, 5, 6), num('red', 2), rules);
    expect(result).toMatchObject({ ok: true, group: { start: 2, end: 6 } });
    if (result.ok) expect(result.group.cards[0]).toMatchObject({ value: 2 });
  });

  it('adds a number above the run (rule sheet: then a 7 and an 8)', () => {
    const first = hit(runOf(3, 4, 5, 6), num('red', 7), rules);
    if (!first.ok) throw new Error('expected ok');
    expect(hit(first.group, num('blue', 8), rules)).toMatchObject({
      ok: true,
      group: { start: 3, end: 8 },
    });
  });

  it('rejects a number that does not touch either end', () => {
    expect(hit(runOf(3, 4, 5, 6), num('red', 9), rules)).toEqual({
      ok: false,
      error: 'not-in-sequence',
    });
    expect(hit(runOf(3, 4, 5, 6), num('red', 4), rules)).toEqual({
      ok: false,
      error: 'not-in-sequence',
    });
  });

  it('does not wrap past 12 or below 1', () => {
    expect(hit(runOf(9, 10, 11, 12), num('red', 1), rules)).toEqual({
      ok: false,
      error: 'not-in-sequence',
    });
    expect(hit(runOf(1, 2, 3, 4), num('red', 12), rules)).toEqual({
      ok: false,
      error: 'not-in-sequence',
    });
  });

  it('places a wild at the only open end', () => {
    expect(hit(runOf(1, 2, 3, 4), wild(), rules)).toMatchObject({
      ok: true,
      group: { start: 1, end: 5 },
    });
    expect(hit(runOf(9, 10, 11, 12), wild(), rules)).toMatchObject({
      ok: true,
      group: { start: 8, end: 12 },
    });
  });

  it('asks where to put a wild when both ends are open', () => {
    expect(hit(runOf(3, 4, 5, 6), wild(), rules)).toEqual({ ok: false, error: 'needs-position' });
  });

  it('puts a wild at the chosen end', () => {
    expect(hit(runOf(3, 4, 5, 6), wild(), rules, 'start')).toMatchObject({
      ok: true,
      group: { start: 2, end: 6 },
    });
    expect(hit(runOf(3, 4, 5, 6), wild(), rules, 'end')).toMatchObject({
      ok: true,
      group: { start: 3, end: 7 },
    });
  });

  it('rejects any hit on a full 1 to 12 run', () => {
    const full = runOf(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12);
    expect(hit(full, wild(), rules)).toEqual({ ok: false, error: 'out-of-range' });
    expect(hit(full, wild(), rules, 'end')).toEqual({ ok: false, error: 'out-of-range' });
  });

  it('rejects a chosen end that is closed', () => {
    expect(hit(runOf(1, 2, 3, 4), wild(), rules, 'start')).toEqual({
      ok: false,
      error: 'out-of-range',
    });
  });

  it('rejects a natural sent to the wrong end', () => {
    expect(hit(runOf(3, 4, 5, 6), num('red', 7), rules, 'start')).toEqual({
      ok: false,
      error: 'not-in-sequence',
    });
  });

  it('keeps wild values fixed (rule sheet: a wild stays as its card)', () => {
    // W stands for 5 in 3, 4, W, 6. A natural 5 cannot be hit onto this run.
    expect(hit(runOf(3, 4, 'W', 6), num('red', 5), rules)).toEqual({
      ok: false,
      error: 'not-in-sequence',
    });
  });

  it('rejects a skip', () => {
    expect(hit(runOf(3, 4, 5, 6), skip(), rules)).toEqual({ ok: false, error: 'contains-skip' });
  });
});

describe('hit on a color group', () => {
  it('adds a card of the same color (rule sheet: more greens on seven greens)', () => {
    expect(hit(greens(1, 2, 3, 5, 8, 8, 12), num('green', 4), rules)).toMatchObject({
      ok: true,
      group: { type: 'color', color: 'green' },
    });
  });

  it('adds a wild', () => {
    expect(hit(greens(1, 2, 3, 5, 8, 8, 12), wild(), rules).ok).toBe(true);
  });

  it('rejects another color', () => {
    expect(hit(greens(1, 2, 3, 5, 8, 8, 12), num('red', 4), rules)).toEqual({
      ok: false,
      error: 'mixed-colors',
    });
  });
});

describe('hit properties', () => {
  it('any legal hit on a run leaves a valid run one card longer', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 11 }).chain((length) =>
          fc.record({
            length: fc.constant(length),
            start: fc.integer({ min: MIN_VALUE, max: MAX_VALUE - length + 1 }),
            wildMask: fc.array(fc.boolean(), { minLength: length, maxLength: length }),
            hitWild: fc.boolean(),
            atStart: fc.boolean(),
          }),
        ),
        ({ length, start, wildMask, hitWild, atStart }) => {
          const run: Card[] = wildMask.map((isWild, i) =>
            isWild && i !== 0 ? wild() : num('red', start + i),
          );
          const group = laid(validateRun(run, 0, rules));
          const end = start + length - 1;
          const canStart = start > MIN_VALUE;
          const toStart = canStart && (atStart || end === MAX_VALUE);
          const card = hitWild ? wild() : num('blue', toStart ? start - 1 : end + 1);
          const result = hit(group, card, rules, toStart ? 'start' : 'end');
          if (!result.ok) throw new Error(result.error);
          expect(result.group.cards).toHaveLength(length + 1);
          expect(validateRun(result.group.cards, length + 1, rules)).toMatchObject({
            ok: true,
            group: { start: toStart ? start - 1 : start, end: toStart ? end : end + 1 },
          });
        },
      ),
    );
  });

  it('any matching card or wild hit on a set or color group keeps it valid', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: MIN_VALUE, max: MAX_VALUE }),
        fc.constantFrom(...COLORS),
        fc.boolean(),
        (value, color, hitWild) => {
          const set = laid(validateSet([num('red', value), num('blue', value)], 0, rules));
          const setHit = hit(set, hitWild ? wild() : num(color, value), rules);
          if (!setHit.ok) throw new Error(setHit.error);
          expect(validateSet(setHit.group.cards, 3, rules).ok).toBe(true);

          const colorGroup = laid(validateColorGroup([num(color, 1), num(color, 9)], 0, rules));
          const colorHit = hit(colorGroup, hitWild ? wild() : num(color, value), rules);
          if (!colorHit.ok) throw new Error(colorHit.error);
          expect(validateColorGroup(colorHit.group.cards, 3, rules).ok).toBe(true);
        },
      ),
    );
  });
});
