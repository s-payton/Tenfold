import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from '@tenfold/engine';
import { COPY, describeLevel, moveErrorMessage } from './copy.ts';

describe('copy', () => {
  it('describes every standard level', () => {
    expect(DEFAULT_RULES.levels.map((l) => describeLevel(l.requirements))).toEqual([
      'Set of 3 + Set of 3',
      'Set of 3 + Run of 4',
      'Set of 4 + Run of 4',
      'Run of 7',
      'Run of 8',
      'Run of 9',
      'Set of 4 + Set of 4',
      '7 of one color',
      'Set of 5 + Set of 2',
      'Set of 5 + Set of 3',
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

  it('never says "phase"', () => {
    expect(JSON.stringify(COPY).toLowerCase()).not.toContain('phase');
  });
});
