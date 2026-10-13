import type { Card } from './cards.ts';
import type { GameState, GameStatus, TableGroup, TurnStep } from './game.ts';

export interface PublicPlayer {
  readonly id: string;
  readonly level: number;
  readonly score: number;
  readonly handCount: number;
  readonly laidDown: boolean;
  readonly skipPending: boolean;
}

/** What everyone at the table may see. Hands, the draw pile and the seed stay hidden. */
export interface TableView {
  readonly players: readonly PublicPlayer[];
  readonly dealerIndex: number;
  readonly currentIndex: number;
  readonly step: TurnStep;
  readonly drawCount: number;
  readonly discardTop: Card | null;
  readonly discardCount: number;
  readonly table: readonly TableGroup[];
  readonly handNumber: number;
  readonly status: GameStatus;
  readonly handWinnerId: string | null;
  readonly winnerId: string | null;
}

/** What one player is allowed to see: the shared table plus their own hand. */
export interface PublicView extends TableView {
  readonly viewerId: string;
  readonly hand: readonly Card[];
}

export const tableView = (state: GameState): TableView => ({
  players: state.players.map((p) => ({
    id: p.id,
    level: p.level,
    score: p.score,
    handCount: p.hand.length,
    laidDown: p.laidDown,
    skipPending: p.skipPending,
  })),
  dealerIndex: state.dealerIndex,
  currentIndex: state.currentIndex,
  step: state.step,
  drawCount: state.drawPile.length,
  discardTop: state.discardPile.at(-1) ?? null,
  discardCount: state.discardPile.length,
  table: state.table,
  handNumber: state.handNumber,
  status: state.status,
  handWinnerId: state.handWinnerId,
  winnerId: state.winnerId,
});

export const publicView = (state: GameState, viewerId: string): PublicView => ({
  ...tableView(state),
  viewerId,
  hand: state.players.find((p) => p.id === viewerId)?.hand ?? [],
});
