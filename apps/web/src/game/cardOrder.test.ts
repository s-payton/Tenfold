import { describe, expect, it } from 'vitest';
import type { Card } from '@tenfold/engine';
import { sortCards } from './cardOrder.ts';

const hand: Card[] = [
  { kind: 'skip', id: 's' },
  { kind: 'number', id: 'g2', color: 'green', value: 2 },
  { kind: 'wild', id: 'w' },
  { kind: 'number', id: 'r9', color: 'red', value: 9 },
  { kind: 'number', id: 'r1', color: 'red', value: 1 },
];

describe('sortCards', () => {
  it('sorts by color then number, with wilds and skips last', () => {
    expect(sortCards(hand, 'color').map((c) => c.id)).toEqual(['r1', 'r9', 'g2', 'w', 's']);
  });

  it('sorts by number then color', () => {
    expect(sortCards(hand, 'number').map((c) => c.id)).toEqual(['r1', 'g2', 'r9', 'w', 's']);
  });
});
