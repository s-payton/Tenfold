import type { Move, MoveError, PublicView, RulesConfig } from '@tenfold/engine';
import type { RoomData } from '@tenfold/server';

/** A rules refusal from the engine, or a network problem. */
export type SendError = MoveError | { readonly code: 'offline' };

/**
 * What the UI talks to. The local fake game implements it now. The Supabase client will
 * implement the same thing later, so screens never see full game state.
 */
export interface GameClient {
  readonly config: RulesConfig;
  readonly myId: string;
  /** Display names by player id. */
  readonly names: Readonly<Record<string, string>>;
  readonly getView: () => PublicView;
  readonly subscribe: (listener: () => void) => () => void;
  /** Resolves to null on success, or why the move was refused. */
  readonly send: (move: Move) => Promise<SendError | null>;
  readonly nextHand: () => void;
  readonly dispose: () => void;
  /** Online only: seats (bots, missed turns) and the turn clock. Same subscribe as the view. */
  readonly getRoomData?: () => RoomData;
  /** Online only: take this seat back from the stand-in bot. */
  readonly reclaim?: () => void;
  /** Online only: leave mid-game; a bot takes the seat until this player comes back. */
  readonly leave?: () => Promise<void>;
}
