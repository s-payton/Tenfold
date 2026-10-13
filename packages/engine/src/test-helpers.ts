import type { Card, Color, NumberCard, SkipCard, WildCard } from './cards.ts';

let counter = 0;
const nextId = (prefix: string): string => `${prefix}-t${String(counter++)}`;

export const num = (color: Color, value: number): NumberCard => ({
  kind: 'number',
  id: nextId(`${color}-${String(value)}`),
  color,
  value,
});

export const wild = (): WildCard => ({ kind: 'wild', id: nextId('wild') });

export const skip = (): SkipCard => ({ kind: 'skip', id: nextId('skip') });

/** Shorthand: numbers become red naturals, 'W' a wild, 'S' a skip. */
export const cards = (...specs: (number | 'W' | 'S')[]): Card[] =>
  specs.map((s) => (s === 'W' ? wild() : s === 'S' ? skip() : num('red', s)));
