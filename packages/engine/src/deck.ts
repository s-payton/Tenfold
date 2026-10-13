import { COLORS, MAX_VALUE, MIN_VALUE, type Card } from './cards.ts';

export const COPIES_PER_NUMBER = 2;
export const WILD_COUNT = 8;
export const SKIP_COUNT = 4;

/** A random number generator returning values in [0, 1). */
export type Rng = () => number;

/** The full 108 card deck in a fixed order with stable ids. */
export const createDeck = (): Card[] => {
  const deck: Card[] = [];
  for (const color of COLORS) {
    for (let value = MIN_VALUE; value <= MAX_VALUE; value++) {
      for (let copy = 0; copy < COPIES_PER_NUMBER; copy++) {
        deck.push({ kind: 'number', id: `${color}-${String(value)}-${String(copy)}`, color, value });
      }
    }
  }
  for (let i = 0; i < WILD_COUNT; i++) deck.push({ kind: 'wild', id: `wild-${String(i)}` });
  for (let i = 0; i < SKIP_COUNT; i++) deck.push({ kind: 'skip', id: `skip-${String(i)}` });
  return deck;
};

/** Seeded mulberry32 generator, so the server can reproduce a shuffle. */
export const createRng = (seed: number): Rng => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Fisher-Yates shuffle that returns a new array. */
export const shuffle = <T>(items: readonly T[], rng: Rng = Math.random): T[] => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = result[i] as T;
    result[i] = result[j] as T;
    result[j] = a;
  }
  return result;
};
