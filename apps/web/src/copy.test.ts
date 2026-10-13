import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from '@tenfold/engine';
import { COPY, describeLevel, explainRequirement, moveErrorMessage } from './copy.ts';

describe('copy', () => {
  it('describes every standard level', () => {
    expect(DEFAULT_RULES.levels.map((l) => describeLevel(l.requirements))).toEqual([
      '2 sets of 3',
      'Set of 3, run of 4',
      'Set of 4, run of 4',
      'Run of 7',
      'Run of 8',
      'Run of 9',
      '2 sets of 4',
      '7 cards of one color',
      'Set of 5, set of 2',
      'Set of 5, set of 3',
    ]);
  });

  it('explains nested level errors', () => {
    expect(
      moveErrorMessage({
        code: 'level-invalid',
        error: { code: 'group-invalid', index: 1, error: 'not-in-sequence' },
      }),
    ).toBe('Group 2: Those numbers are not in a row.');
  });

  it('explains each kind of group in plain words', () => {
    expect(explainRequirement({ type: 'set', size: 3 })).toBe('3 cards with the same number');
    expect(explainRequirement({ type: 'run', size: 4 })).toBe('4 numbers in a row, like 3 4 5 6');
    expect(explainRequirement({ type: 'run', size: 9 })).toBe('9 numbers in a row, like 3 4 5 6 7...');
  });

  it('never says "phase"', () => {
    expect(JSON.stringify(COPY).toLowerCase()).not.toContain('phase');
  });
});
