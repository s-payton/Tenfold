import type { RulesConfig } from './config.ts';
import { getLevel } from './levels.ts';
import type { Move } from './moves.ts';
import { cardPoints } from './scoring.ts';
import { findHits, findLevel } from './solver.ts';
import type { PublicView } from './view.ts';

const currentPlayer = (view: PublicView) => {
  const me = view.players[view.currentIndex];
  if (!me || me.id !== view.viewerId) throw new RangeError('It is not the viewer\'s turn');
  return me;
};

/**
 * Discards the highest-point card that is not a Wild (first one wins ties). Wilds are
 * kept because they are the most useful card. A Skip goes to the next player who can be
 * skipped.
 */
const discardHighest = (view: PublicView, config: RulesConfig): Move => {
  const nonWild = view.hand.filter((c) => c.kind !== 'wild');
  const pool = nonWild.length > 0 ? nonWild : view.hand;
  const card = pool.reduce((best, c) => (cardPoints(c) > cardPoints(best) ? c : best));
  if (card.kind !== 'skip' || !config.skipLosesTurn || view.hand.length === 1) {
    return { type: 'discard', cardId: card.id };
  }
  const count = view.players.length;
  for (let k = 1; k < count; k++) {
    const target = view.players[(view.currentIndex + k) % count];
    if (target && !target.skipPending) return { type: 'discard', cardId: card.id, skipTarget: target.id };
  }
  return { type: 'discard', cardId: card.id };
};

/**
 * The move the server makes for a player whose turn timer runs out: draw from the deck,
 * then discard the highest card that is not a Wild. `view` is that player's view.
 */
export const autoMove = (view: PublicView, config: RulesConfig): Move => {
  currentPlayer(view);
  return view.step === 'draw' ? { type: 'draw', source: 'deck' } : discardHighest(view, config);
};

/**
 * A simple opponent: takes a Wild from the discard pile, lays down as soon as it can,
 * hits whenever it can, then discards its highest card that is not a Wild.
 * Call it once per move until the turn passes.
 */
export const basicMove = (view: PublicView, config: RulesConfig): Move => {
  const me = currentPlayer(view);
  if (view.step === 'draw') {
    return view.discardTop?.kind === 'wild'
      ? { type: 'draw', source: 'discard' }
      : { type: 'draw', source: 'deck' };
  }
  if (!me.laidDown) {
    const level = getLevel(config, me.level);
    const groups = level ? findLevel(view.hand, level, config) : null;
    if (groups) return { type: 'lay-down', groups: groups.map((g) => g.map((c) => c.id)) };
  } else {
    const [firstHit] = findHits(view.hand, view.table, me.id, config);
    if (firstHit) return firstHit;
  }
  return discardHighest(view, config);
};
