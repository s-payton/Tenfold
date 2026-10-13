import type { Card } from './cards.ts';
import type { RulesConfig } from './config.ts';
import type { GameState } from './game.ts';
import { applyMove, type Move } from './moves.ts';
import { publicView, type PublicView } from './view.ts';

/** Stand-ins for cards this player cannot see. They never reach the returned view. */
const hidden = (count: number, tag: string): Card[] =>
  Array.from({ length: count }, (_, i) => ({
    kind: 'number',
    id: `hidden-${tag}-${String(i)}`,
    color: 'red',
    value: 1,
  }));

/**
 * Works out the view a move will produce, from the mover's own view, so the screen can
 * update before the server answers. Returns null when that is not possible without
 * secret information: draws (the card is unknown) and moves that end the hand (scoring
 * needs other hands). The server's answer always replaces the prediction.
 */
export const predictView = (view: PublicView, move: Move, config: RulesConfig): PublicView | null => {
  if (move.type === 'draw' || view.status !== 'playing') return null;
  const state: GameState = {
    players: view.players.map((p) => ({
      id: p.id,
      level: p.level,
      score: p.score,
      laidDown: p.laidDown,
      skipPending: p.skipPending,
      hand: p.id === view.viewerId ? view.hand : hidden(p.handCount, p.id),
    })),
    dealerIndex: view.dealerIndex,
    currentIndex: view.currentIndex,
    step: view.step,
    drawPile: hidden(view.drawCount, 'draw'),
    discardPile: [
      ...hidden(Math.max(0, view.discardCount - 1), 'discard'),
      ...(view.discardTop ? [view.discardTop] : []),
    ],
    table: view.table,
    handNumber: view.handNumber,
    status: view.status,
    handWinnerId: view.handWinnerId,
    winnerId: view.winnerId,
    turn: view.turn,
    lastSkipped: view.lastSkipped,
    seed: 0,
  };
  const result = applyMove(state, view.viewerId, move, config);
  if (!result.ok || result.state.status !== 'playing') return null;
  return publicView(result.state, view.viewerId);
};
