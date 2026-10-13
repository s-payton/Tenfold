import { COLORS, type Card } from '@tenfold/engine';

export type SortMode = 'color' | 'number';

const KIND_ORDER = { number: 0, wild: 1, skip: 2 } as const;

const compare = (mode: SortMode) => (a: Card, b: Card): number => {
  if (a.kind !== 'number' || b.kind !== 'number') return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  const byColor = COLORS.indexOf(a.color) - COLORS.indexOf(b.color);
  const byValue = a.value - b.value;
  return mode === 'color' ? byColor || byValue : byValue || byColor;
};

export const sortCards = (cards: readonly Card[], mode: SortMode): Card[] =>
  [...cards].sort(compare(mode));
