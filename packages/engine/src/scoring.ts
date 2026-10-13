import type { Card } from './cards.ts';

export const LOW_NUMBER_POINTS = 5;
export const HIGH_NUMBER_POINTS = 10;
export const SKIP_POINTS = 15;
export const WILD_POINTS = 25;

/** Penalty points for a card left in hand at the end of a hand. */
export const cardPoints = (card: Card): number => {
  switch (card.kind) {
    case 'number':
      return card.value <= 9 ? LOW_NUMBER_POINTS : HIGH_NUMBER_POINTS;
    case 'skip':
      return SKIP_POINTS;
    case 'wild':
      return WILD_POINTS;
  }
};

export const handPoints = (cards: readonly Card[]): number =>
  cards.reduce((sum, card) => sum + cardPoints(card), 0);
