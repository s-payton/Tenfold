import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createDeck } from './deck.ts';
import { cardPoints, handPoints } from './scoring.ts';
import { num, skip, wild } from './test-helpers.ts';

describe('cardPoints', () => {
  it('scores 1 to 9 as 5 points', () => {
    for (let v = 1; v <= 9; v++) expect(cardPoints(num('red', v))).toBe(5);
  });

  it('scores 10 to 12 as 10 points', () => {
    for (let v = 10; v <= 12; v++) expect(cardPoints(num('blue', v))).toBe(10);
  });

  it('scores a Skip as 15 and a Wild as 25', () => {
    expect(cardPoints(skip())).toBe(15);
    expect(cardPoints(wild())).toBe(25);
  });
});

describe('handPoints', () => {
  it('is 0 for an empty hand', () => {
    expect(handPoints([])).toBe(0);
  });

  it('adds up a mixed hand', () => {
    expect(handPoints([num('red', 3), num('green', 11), skip(), wild()])).toBe(5 + 10 + 15 + 25);
  });

  it('scores the full deck at 860', () => {
    // 4 colors x 2 copies x (9 x 5 + 3 x 10) + 4 x 15 + 8 x 25
    expect(handPoints(createDeck())).toBe(600 + 60 + 200);
  });

  it('property: equals the sum of card points for any subset of the deck', () => {
    const deck = createDeck();
    fc.assert(
      fc.property(fc.subarray(deck), (hand) => {
        const total = handPoints(hand);
        expect(total).toBe(hand.reduce((sum, c) => sum + cardPoints(c), 0));
        expect(total).toBeGreaterThanOrEqual(5 * hand.length);
        expect(total).toBeLessThanOrEqual(25 * hand.length);
      }),
    );
  });
});
