import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from './config.ts';
import { STANDARD_LEVELS, getLevel } from './levels.ts';

describe('STANDARD_LEVELS', () => {
  it('has 10 levels numbered 1 to 10', () => {
    expect(STANDARD_LEVELS.map((l) => l.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('matches the standard rules', () => {
    expect(STANDARD_LEVELS.map((l) => l.requirements)).toEqual([
      [{ type: 'set', size: 3 }, { type: 'set', size: 3 }],
      [{ type: 'set', size: 3 }, { type: 'run', size: 4 }],
      [{ type: 'set', size: 4 }, { type: 'run', size: 4 }],
      [{ type: 'run', size: 7 }],
      [{ type: 'run', size: 8 }],
      [{ type: 'run', size: 9 }],
      [{ type: 'set', size: 4 }, { type: 'set', size: 4 }],
      [{ type: 'color', size: 7 }],
      [{ type: 'set', size: 5 }, { type: 'set', size: 2 }],
      [{ type: 'set', size: 5 }, { type: 'set', size: 3 }],
    ]);
  });

  it('never needs more cards than a hand plus one draw', () => {
    for (const level of STANDARD_LEVELS) {
      const total = level.requirements.reduce((sum, r) => sum + r.size, 0);
      expect(total).toBeLessThanOrEqual(DEFAULT_RULES.handSize);
    }
  });
});

describe('getLevel', () => {
  it('looks up a level by number from the config', () => {
    expect(getLevel(DEFAULT_RULES, 4)?.requirements).toEqual([{ type: 'run', size: 7 }]);
  });

  it('returns undefined past the last level', () => {
    expect(getLevel(DEFAULT_RULES, 11)).toBeUndefined();
    expect(getLevel(DEFAULT_RULES, 0)).toBeUndefined();
  });
});

describe('DEFAULT_RULES', () => {
  it('uses standard rules', () => {
    expect(DEFAULT_RULES).toMatchObject({
      handSize: 10,
      requireNaturalCard: true,
      allowHitOnOthers: true,
      skipLosesTurn: true,
      allowWildDiscard: true,
    });
    expect(DEFAULT_RULES.levels).toBe(STANDARD_LEVELS);
  });
});
