export const COLORS = ['red', 'blue', 'green', 'yellow'] as const;
export type Color = (typeof COLORS)[number];

export const MIN_VALUE = 1;
export const MAX_VALUE = 12;

export interface NumberCard {
  readonly kind: 'number';
  readonly id: string;
  readonly color: Color;
  readonly value: number;
}

export interface WildCard {
  readonly kind: 'wild';
  readonly id: string;
}

export interface SkipCard {
  readonly kind: 'skip';
  readonly id: string;
}

export type Card = NumberCard | WildCard | SkipCard;

export const isNatural = (card: Card): card is NumberCard => card.kind === 'number';
