import type { Move, MoveError, PublicView, RulesConfig } from '@tenfold/engine';

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
}
