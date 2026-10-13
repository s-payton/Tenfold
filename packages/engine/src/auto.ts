import type { RulesConfig } from './config.ts';
import type { GameState } from './game.ts';
import type { Move } from './moves.ts';
import { cardPoints } from './scoring.ts';

/**
 * The move the server makes for a player whose turn timer runs out: draw from the deck,
 * then discard the highest-point card (first one wins ties). Always legal.
 */
export const autoMove = (state: GameState, config: RulesConfig): Move => {
  if (state.step === 'draw') return { type: 'draw', source: 'deck' };
  const me = state.players[state.currentIndex];
  if (!me) throw new RangeError('No current player');
  const discardable = me.hand.filter((c) => c.kind !== 'wild' || config.allowWildDiscard);
  const pool = discardable.length > 0 ? discardable : me.hand;
  const card = pool.reduce((best, c) => (cardPoints(c) > cardPoints(best) ? c : best));
  if (card.kind !== 'skip' || !config.skipLosesTurn || me.hand.length === 1) {
    return { type: 'discard', cardId: card.id };
  }
  const count = state.players.length;
  for (let k = 1; k < count; k++) {
    const target = state.players[(state.currentIndex + k) % count];
    if (target && !target.skipPending) return { type: 'discard', cardId: card.id, skipTarget: target.id };
  }
  return { type: 'discard', cardId: card.id };
};
