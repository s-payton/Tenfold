import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { COLORS, MAX_VALUE, MIN_VALUE } from './cards.ts';
import { createDeck, createRng, shuffle } from './deck.ts';

describe('createDeck', () => {
  const deck = createDeck();

  it('has exactly 108 cards', () => {
    expect(deck).toHaveLength(108);
  });

  it('has 2 copies of every number in every color', () => {
    for (const color of COLORS) {
      for (let value = MIN_VALUE; value <= MAX_VALUE; value++) {
        const copies = deck.filter(
          (c) => c.kind === 'number' && c.color === color && c.value === value,
        );
        expect(copies).toHaveLength(2);
      }
    }
  });

  it('has 96 number cards, 8 wilds and 4 skips', () => {
    expect(deck.filter((c) => c.kind === 'number')).toHaveLength(96);
    expect(deck.filter((c) => c.kind === 'wild')).toHaveLength(8);
    expect(deck.filter((c) => c.kind === 'skip')).toHaveLength(4);
  });

  it('gives every card a unique id', () => {
    expect(new Set(deck.map((c) => c.id)).size).toBe(108);
  });

  it('is deterministic', () => {
    expect(createDeck()).toEqual(deck);
  });
});

describe('createRng', () => {
  it('returns values in [0, 1)', () => {
    const rng = createRng(42);
    for (let i = 0; i < 1000; i++) {
      const n = rng();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });

  it('is reproducible for the same seed', () => {
    const a = createRng(7);
    const b = createRng(7);
    for (let i = 0; i < 20; i++) expect(a()).toBe(b());
  });
});

describe('shuffle', () => {
  it('does not mutate its input', () => {
    const deck = createDeck();
    const copy = [...deck];
    shuffle(deck, createRng(1));
    expect(deck).toEqual(copy);
  });

  it('is reproducible for the same seed', () => {
    expect(shuffle(createDeck(), createRng(99))).toEqual(shuffle(createDeck(), createRng(99)));
  });

  it('actually reorders the deck', () => {
    expect(shuffle(createDeck(), createRng(3))).not.toEqual(createDeck());
  });

  it('property: always yields a 108 card permutation of the deck', () => {
    const sortedIds = createDeck()
      .map((c) => c.id)
      .sort();
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const shuffled = shuffle(createDeck(), createRng(seed));
        expect(shuffled).toHaveLength(108);
        expect(shuffled.map((c) => c.id).sort()).toEqual(sortedIds);
      }),
    );
  });
});
